/**
 * Private Mempool
 * Encrypted transaction pool to prevent front-running and MEV extraction
 * 
 * Transactions are encrypted until block inclusion, preventing:
 * - Front-running
 * - Sandwich attacks
 * - MEV extraction
 */

import { sha256 } from '../utils/crypto.js';
import { logger } from '../utils/logger.js';
import * as crypto from 'crypto';

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const MAX_PENDING_ENCRYPTED = 1000;
const DECRYPTION_DELAY_BLOCKS = 1;

interface EncryptedTransaction {
    id: string;
    encryptedData: string;
    iv: string;
    authTag: string;
    sender: string;
    submitBlock: number;
    timestamp: number;
}

interface DecryptedTransaction {
    fromAddress: string;
    toAddress: string;
    amount: number;
    fee: number;
    nonce: number;
    chainId: string;
}

export class PrivateMempool {
    private encryptedPool: Map<string, EncryptedTransaction> = new Map();
    private blockKeys: Map<number, string> = new Map(); // Block number -> key for that block
    private log = logger.child('PrivateMempool');

    /**
     * Generate a key for a specific block
     * In production, this would use a commit-reveal scheme or threshold encryption
     */
    generateBlockKey(blockIndex: number, blockHash: string): string {
        // Key is derived from block hash + index (only known after block is created)
        const key = sha256(blockHash + blockIndex.toString() + 'LVENC_PRIVATE');
        this.blockKeys.set(blockIndex, key);
        return key;
    }

    /**
     * Encrypt a transaction for private submission
     */
    encryptTransaction(
        txData: DecryptedTransaction,
        targetBlock: number,
        senderPublicKey: string
    ): EncryptedTransaction {
        // Generate ephemeral key (in production, use the block-commit key)
        const tempKey = sha256(senderPublicKey + targetBlock.toString() + Date.now().toString());
        const keyBuffer = Buffer.from(tempKey.slice(0, 32), 'hex');

        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, keyBuffer, iv);

        const txJson = JSON.stringify(txData);
        let encrypted = cipher.update(txJson, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        const authTag = cipher.getAuthTag().toString('hex');
        const id = sha256(encrypted + Date.now().toString());

        const encryptedTx: EncryptedTransaction = {
            id,
            encryptedData: encrypted,
            iv: iv.toString('hex'),
            authTag,
            sender: senderPublicKey,
            submitBlock: targetBlock,
            timestamp: Date.now(),
        };

        this.log.debug(`Encrypted transaction ${id.slice(0, 12)}... for block ${targetBlock}`);
        return encryptedTx;
    }

    /**
     * Submit an encrypted transaction to the private mempool
     */
    submitEncrypted(encryptedTx: EncryptedTransaction): boolean {
        if (this.encryptedPool.size >= MAX_PENDING_ENCRYPTED) {
            this.log.warn('Private mempool full');
            return false;
        }

        if (this.encryptedPool.has(encryptedTx.id)) {
            return false; // Duplicate
        }

        this.encryptedPool.set(encryptedTx.id, encryptedTx);
        this.log.info(`Received encrypted tx ${encryptedTx.id.slice(0, 12)}...`);
        return true;
    }

    /**
     * Get transactions ready for decryption (after delay)
     */
    getDecryptableTransactions(currentBlock: number): EncryptedTransaction[] {
        const ready: EncryptedTransaction[] = [];

        for (const tx of this.encryptedPool.values()) {
            if (currentBlock >= tx.submitBlock + DECRYPTION_DELAY_BLOCKS) {
                ready.push(tx);
            }
        }

        return ready;
    }

    /**
     * Decrypt a transaction using the block key
     */
    decryptTransaction(
        encryptedTx: EncryptedTransaction,
        blockKey: string
    ): DecryptedTransaction | null {
        try {
            const keyBuffer = Buffer.from(
                sha256(encryptedTx.sender + encryptedTx.submitBlock.toString() + blockKey).slice(0, 32),
                'hex'
            );

            const decipher = crypto.createDecipheriv(
                ENCRYPTION_ALGORITHM,
                keyBuffer,
                Buffer.from(encryptedTx.iv, 'hex')
            );

            decipher.setAuthTag(Buffer.from(encryptedTx.authTag, 'hex'));

            let decrypted = decipher.update(encryptedTx.encryptedData, 'hex', 'utf8');
            decrypted += decipher.final('utf8');

            // Remove from pool
            this.encryptedPool.delete(encryptedTx.id);

            return JSON.parse(decrypted) as DecryptedTransaction;
        } catch (error) {
            this.log.error(`Failed to decrypt tx ${encryptedTx.id.slice(0, 12)}...`);
            return null;
        }
    }

    /**
     * Get pool statistics
     */
    getStats(): { pending: number; oldestBlock: number } {
        let oldestBlock = Infinity;
        for (const tx of this.encryptedPool.values()) {
            if (tx.submitBlock < oldestBlock) {
                oldestBlock = tx.submitBlock;
            }
        }

        return {
            pending: this.encryptedPool.size,
            oldestBlock: oldestBlock === Infinity ? 0 : oldestBlock,
        };
    }

    /**
     * Cleanup expired transactions
     */
    cleanup(currentBlock: number, maxAge: number = 100): void {
        for (const [id, tx] of this.encryptedPool) {
            if (currentBlock - tx.submitBlock > maxAge) {
                this.encryptedPool.delete(id);
                this.log.debug(`Removed expired encrypted tx ${id.slice(0, 12)}...`);
            }
        }
    }
}

export const privateMempool = new PrivateMempool();
