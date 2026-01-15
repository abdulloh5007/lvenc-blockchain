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
    signature?: string;
}

export class Transaction implements TransactionData {
    public id: string;
    public fromAddress: string | null;
    public toAddress: string;
    public amount: number;
    public fee: number;
    public timestamp: number;
    public signature?: string;

    constructor(
        fromAddress: string | null,
        toAddress: string,
        amount: number,
        fee: number = 0,
        timestamp?: number,
        id?: string
    ) {
        this.id = id || uuidv4();
        this.fromAddress = fromAddress;
        this.toAddress = toAddress;
        this.amount = amount;
        this.fee = fee;
        this.timestamp = timestamp || Date.now();
    }

    /**
     * Get total amount needed (amount + fee)
     */
    getTotalCost(): number {
        return this.amount + this.fee;
    }

    /**
     * Calculate the hash of this transaction
     */
    calculateHash(): string {
        return sha256(
            (this.fromAddress || '') +
            this.toAddress +
            this.amount.toString() +
            this.fee.toString() +
            this.timestamp.toString()
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
        const addressFromKey = 'EDU' + sha256(publicKey).substring(0, 40);

        if (addressFromKey !== this.fromAddress) {
            throw new Error('Cannot sign transaction for other wallets!');
        }

        const hash = this.calculateHash();
        const signature = keyPair.sign(hash, 'base64');
        this.signature = signature.toDER('hex');
    }

    /**
     * Verify the transaction signature
     */
    isValid(): boolean {
        // Mining rewards and faucet transactions don't need signature
        if (this.fromAddress === null || this.fee === 0) {
            return true;
        }
        if (!this.signature || this.signature.length === 0) {
            throw new Error('No signature in this transaction');
        }
        return this.signature.length > 0;
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
            data.id
        );
        tx.signature = data.signature;
        return tx;
    }
}
