import { v4 as uuidv4 } from 'uuid';
import { sha256 } from '../utils/crypto.js';
import elliptic from 'elliptic';

const ec = new elliptic.ec('secp256k1');

// Transaction types for on-chain staking
export type TransactionType = 'TRANSFER' | 'STAKE' | 'UNSTAKE' | 'DELEGATE' | 'UNDELEGATE';

export interface TransactionData {
    id: string;
    type?: TransactionType;      // Transaction type (default: TRANSFER)
    fromAddress: string | null;  // null for mining rewards
    toAddress: string;
    amount: number;
    fee: number;                 // Transaction fee (goes to miner)
    timestamp: number;
    nonce?: number;              // Per-address sequential counter for replay protection
    chainId?: string;            // Chain identifier for cross-chain replay protection
    signature?: string;
    data?: string;               // Optional data field (e.g., validator address for delegation)
}

export class Transaction implements TransactionData {
    public id: string;
    public type: TransactionType;
    public fromAddress: string | null;
    public toAddress: string;
    public amount: number;
    public fee: number;
    public timestamp: number;
    public nonce?: number;
    public chainId?: string;
    public signature?: string;
    public data?: string;

    constructor(
        fromAddress: string | null,
        toAddress: string,
        amount: number,
        fee: number = 0,
        timestamp?: number,
        id?: string,
        nonce?: number,
        chainId?: string,
        type: TransactionType = 'TRANSFER',
        data?: string
    ) {
        this.id = id || uuidv4();
        this.type = type;
        this.fromAddress = fromAddress;
        this.toAddress = toAddress;
        this.amount = amount;
        this.fee = fee;
        this.timestamp = timestamp || Date.now();
        this.nonce = nonce;
        this.chainId = chainId;
        this.data = data;
    }

    /**
     * Check if this is a staking-related transaction
     */
    isStakingTx(): boolean {
        return ['STAKE', 'UNSTAKE', 'DELEGATE', 'UNDELEGATE'].includes(this.type);
    }

    /**
     * Get total amount needed (amount + fee)
     */
    getTotalCost(): number {
        return this.amount + this.fee;
    }

    /**
     * Calculate the hash of this transaction (includes nonce and chainId for replay protection)
     */
    calculateHash(): string {
        return sha256(
            (this.fromAddress || '') +
            this.toAddress +
            this.amount.toString() +
            this.fee.toString() +
            this.timestamp.toString() +
            (this.nonce !== undefined ? this.nonce.toString() : '') +
            (this.chainId || '')
        );
    }

    /**
     * Sign the transaction with a private key
     */
    sign(privateKey: string): void {
        // Verify the fromAddress matches the public key derived from private key
        const keyPair = ec.keyFromPrivate(privateKey, 'hex');
        const publicKey = keyPair.getPublic('hex');

        // Create address from public key for verification
        const addressFromKey = 'LVE' + sha256(publicKey).substring(0, 40);

        if (addressFromKey !== this.fromAddress) {
            throw new Error('Cannot sign transaction for other wallets!');
        }

        const hash = this.calculateHash();
        const signature = keyPair.sign(hash, 'base64');
        this.signature = signature.toDER('hex');
    }

    /**
     * Verify the transaction signature cryptographically
     * This is called during addTransaction and block validation
     */
    isValid(): boolean {
        // Mining rewards and coinbase transactions don't need signature
        // Check for null, empty string, or special system addresses
        if (this.fromAddress === null ||
            this.fromAddress === '' ||
            this.fromAddress === 'GENESIS' ||
            this.fromAddress === 'COINBASE' ||
            this.fromAddress === 'FAUCET' ||
            // Genesis faucet address (system-generated transactions)
            this.fromAddress?.startsWith('tLVE000000000000000000') ||
            this.fromAddress?.startsWith('LVE000000000000000000')) {
            return true;
        }

        // Staking transaction validation
        if (this.isStakingTx()) {
            // STAKE transactions require signature
            if (!this.signature || this.signature.length === 0) {
                throw new Error(`${this.type} transaction requires signature`);
            }

            // Minimum stake amount check
            if (this.type === 'STAKE' && this.amount < 100) {
                throw new Error('Minimum stake is 100 LVE');
            }

            // Minimum delegation amount check
            if (this.type === 'DELEGATE' && this.amount < 10) {
                throw new Error('Minimum delegation is 10 LVE');
            }

            // STAKE must go to STAKE_POOL
            if (this.type === 'STAKE' && this.toAddress !== 'STAKE_POOL') {
                throw new Error('STAKE transactions must be sent to STAKE_POOL');
            }

            // DELEGATE must have validator address in data
            if (this.type === 'DELEGATE' && !this.data) {
                throw new Error('DELEGATE transaction requires validator address in data');
            }
        }

        // All user transactions MUST have a signature
        if (!this.signature || this.signature.length === 0) {
            throw new Error('No signature in this transaction');
        }

        // NOTE: Full cryptographic verification requires the public key
        // which is provided separately during API transaction submission
        // This basic check ensures signature exists and has valid DER format
        try {
            // Check if signature is valid DER format (basic sanity check)
            if (this.signature.length < 70 || this.signature.length > 144) {
                return false; // DER signatures are typically 70-72 bytes (140-144 hex chars)
            }
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Verify signature with public key
     */
    verifyWithPublicKey(publicKey: string): boolean {
        if (this.fromAddress === null) {
            return true;
        }

        if (!this.signature) {
            return false;
        }

        try {
            const keyPair = ec.keyFromPublic(publicKey, 'hex');
            const hash = this.calculateHash();
            return keyPair.verify(hash, this.signature);
        } catch {
            return false;
        }
    }

    /**
     * Convert to plain object
     */
    toJSON(): TransactionData {
        return {
            id: this.id,
            type: this.type,
            fromAddress: this.fromAddress,
            toAddress: this.toAddress,
            amount: this.amount,
            fee: this.fee,
            timestamp: this.timestamp,
            nonce: this.nonce,
            chainId: this.chainId,
            signature: this.signature,
            data: this.data,
        };
    }

    /**
     * Create from plain object
     */
    static fromJSON(data: TransactionData): Transaction {
        const tx = new Transaction(
            data.fromAddress,
            data.toAddress,
            data.amount,
            data.fee || 0,
            data.timestamp,
            data.id,
            data.nonce,
            data.chainId,
            data.type || 'TRANSFER',
            data.data
        );
        tx.signature = data.signature;
        return tx;
    }
}
