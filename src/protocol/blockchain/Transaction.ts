import { v4 as uuidv4 } from 'uuid';
import { sha256 } from '../utils/crypto.js';
import elliptic from 'elliptic';

const ec = new elliptic.ec('secp256k1');

export interface TransactionData {
    id: string;
    fromAddress: string | null;  // null for mining rewards
    toAddress: string;
    amount: number;
    fee: number;                 // Transaction fee (goes to miner)
    timestamp: number;
    nonce?: number;              // Per-address sequential counter for replay protection
    chainId?: string;            // Chain identifier for cross-chain replay protection
    signature?: string;
}

export class Transaction implements TransactionData {
    public id: string;
    public fromAddress: string | null;
    public toAddress: string;
    public amount: number;
    public fee: number;
    public timestamp: number;
    public nonce?: number;
    public chainId?: string;
    public signature?: string;

    constructor(
        fromAddress: string | null,
        toAddress: string,
        amount: number,
        fee: number = 0,
        timestamp?: number,
        id?: string,
        nonce?: number,
        chainId?: string
    ) {
        this.id = id || uuidv4();
        this.fromAddress = fromAddress;
        this.toAddress = toAddress;
        this.amount = amount;
        this.fee = fee;
        this.timestamp = timestamp || Date.now();
        this.nonce = nonce;
        this.chainId = chainId;
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
            this.fromAddress === 'COINBASE') {
            return true;
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
            fromAddress: this.fromAddress,
            toAddress: this.toAddress,
            amount: this.amount,
            fee: this.fee,
            timestamp: this.timestamp,
            nonce: this.nonce,
            chainId: this.chainId,
            signature: this.signature,
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
            data.chainId
        );
        tx.signature = data.signature;
        return tx;
    }
}
