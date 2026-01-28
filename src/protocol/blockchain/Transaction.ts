import { v4 as uuidv4 } from 'uuid';
import { sha256 } from '../utils/crypto.js';
import * as ed from '@noble/ed25519';

// Signature scheme - ed25519 is the ONLY accepted scheme
// secp256k1 is DEPRECATED and will be rejected for new transactions
export type SignatureScheme = 'ed25519';

// Transaction types for on-chain staking
export type TransactionType = 'TRANSFER' | 'STAKE' | 'UNSTAKE' | 'DELEGATE' | 'UNDELEGATE' | 'CLAIM_REWARD' | 'CLAIM' | 'COMMISSION';

export interface TransactionData {
    id: string;
    type?: TransactionType;      // Transaction type (default: TRANSFER)
    fromAddress: string | null;  // null for mining rewards
    toAddress: string;
    amount: number;
    fee: number;                 // Transaction fee (goes to validator)
    timestamp: number;
    nonce?: number;              // Per-address sequential counter for replay protection
    chainId?: string;            // Chain identifier for cross-chain replay protection
    signature?: string;          // Ed25519 signature (hex)
    publicKey?: string;          // Ed25519 public key (hex) for verification
    signatureScheme?: SignatureScheme;  // Must be 'ed25519'
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
    public publicKey?: string;           // Ed25519 public key for verification
    public signatureScheme?: SignatureScheme;  // Must be 'ed25519'
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
        data?: string,
        signatureScheme?: SignatureScheme,
        publicKey?: string
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
        this.signatureScheme = signatureScheme;
        this.publicKey = publicKey;
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
     * Calculate the CANONICAL hash of this transaction for signing
     * 
     * SECURITY: This hash is used for signature verification.
     * All nodes MUST produce identical hash for identical tx.
     * 
     * Domain separation via chainId + txType prevents:
     * - Cross-chain replay attacks (chainId)
     * - Transaction type confusion attacks (txType)
     * 
     * Replay protection via nonce:
     * - Each account has a sequence number
     * - Tx is valid only if nonce = account.nonce
     * 
     * EXCLUDED: timestamp (non-deterministic), signature, id
     * 
     * Format: sha256(chainId || txType || from || to || amount || fee || nonce)
     */
    calculateHash(): string {
        // For user transactions, nonce and chainId are REQUIRED
        // Coinbase/reward transactions are exempt
        if (this.fromAddress && this.nonce === undefined) {
            throw new Error('Nonce is required for user transactions');
        }
        if (this.fromAddress && !this.chainId) {
            throw new Error('ChainId is required for user transactions');
        }

        return sha256(
            (this.chainId || '') +           // Domain: network
            this.type +                       // Domain: tx type
            (this.fromAddress || '') +        // Sender
            this.toAddress +                  // Recipient
            this.amount.toString() +          // Amount
            this.fee.toString() +             // Fee
            (this.nonce !== undefined ? this.nonce.toString() : '')  // Sequence
        );
    }

    /**
     * Sign the transaction with an ed25519 private key (async)
     * 
     * NOTE: This method is for server-side/testing use only.
     * In production, client signs transactions locally and sends signature.
     * 
     * @param privateKey - 32-byte ed25519 private key (hex)
     */
    async signEd25519(privateKey: string): Promise<void> {
        // Get public key from private key
        const privateKeyBytes = Buffer.from(privateKey, 'hex');
        const publicKeyBytes = await ed.getPublicKeyAsync(privateKeyBytes);
        const publicKeyHex = Buffer.from(publicKeyBytes).toString('hex');

        // Create address from ed25519 public key (native format, NOT Ethereum-style)
        // Format: prefix + sha256(publicKey).slice(0, 40)
        const prefix = this.chainId?.includes('testnet') ? 'tLVE' : 'LVE';
        const addressFromKey = prefix + sha256(publicKeyHex).substring(0, 40);

        if (addressFromKey !== this.fromAddress) {
            throw new Error('Cannot sign transaction for other wallets!');
        }

        // Sign canonical hash with ed25519
        const hash = this.calculateHash();
        const hashBytes = Buffer.from(hash, 'hex');
        const signatureBytes = await ed.signAsync(hashBytes, privateKeyBytes);

        this.signature = Buffer.from(signatureBytes).toString('hex');
        this.publicKey = publicKeyHex;
        this.signatureScheme = 'ed25519';
    }

    /**
     * @deprecated Use signEd25519 instead. secp256k1 is no longer supported.
     */
    sign(_privateKey: string): void {
        throw new Error('secp256k1 signing is deprecated. Use signEd25519() or client-side ed25519 signing.');
    }

    /**
     * Verify the transaction is valid for inclusion in mempool/block
     * This is called during addTransaction and block validation
     */
    isValid(): boolean {
        // Mining rewards and coinbase transactions don't need signature/nonce/chainId
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

        // ========== REPLAY PROTECTION ==========
        // All user transactions MUST have nonce and chainId
        if (this.nonce === undefined) {
            throw new Error('Nonce is required for replay protection');
        }
        if (!this.chainId) {
            throw new Error('ChainId is required for cross-chain replay protection');
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

        // ========== ED25519 ENFORCEMENT ==========
        // signatureScheme must be explicitly 'ed25519'
        if (this.signatureScheme !== 'ed25519') {
            throw new Error('signatureScheme must be explicitly set to "ed25519"');
        }

        // publicKey must be provided for verification
        if (!this.publicKey || this.publicKey.length === 0) {
            throw new Error('publicKey is required for signature verification');
        }

        // Basic signature format check
        // Ed25519 signatures are exactly 64 bytes (128 hex chars)
        try {
            if (this.signature.length !== 128) {
                throw new Error(`Invalid ed25519 signature length: ${this.signature.length} (expected 128 hex chars)`);
            }
            // Ed25519 public keys are exactly 32 bytes (64 hex chars)
            if (this.publicKey.length !== 64) {
                throw new Error(`Invalid ed25519 public key length: ${this.publicKey.length} (expected 64 hex chars)`);
            }
            return true;
        } catch (e) {
            if (e instanceof Error) throw e;
            return false;
        }
    }

    /**
     * Verify ed25519 signature with public key (async)
     * 
     * @param publicKey - 32-byte ed25519 public key (hex)
     * @returns true if signature is valid
     */
    async verifyEd25519(publicKey?: string): Promise<boolean> {
        if (this.fromAddress === null) {
            return true;  // Coinbase tx
        }

        const pubKey = publicKey || this.publicKey;
        if (!this.signature || !pubKey) {
            return false;
        }

        // Enforce ed25519 scheme for new transactions
        if (this.signatureScheme && this.signatureScheme !== 'ed25519') {
            return false;  // Reject non-ed25519 schemes
        }

        try {
            const hash = this.calculateHash();
            const hashBytes = Buffer.from(hash, 'hex');
            const signatureBytes = Buffer.from(this.signature, 'hex');
            const publicKeyBytes = Buffer.from(pubKey, 'hex');

            return await ed.verifyAsync(signatureBytes, hashBytes, publicKeyBytes);
        } catch {
            return false;
        }
    }

    /**
     * @deprecated Use verifyEd25519 instead. secp256k1 is no longer supported.
     */
    verifyWithPublicKey(_publicKey: string): boolean {
        throw new Error('secp256k1 verification is deprecated. Use verifyEd25519().');
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
            publicKey: this.publicKey,
            signatureScheme: this.signatureScheme,
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
            data.data,
            data.signatureScheme,
            data.publicKey
        );
        tx.signature = data.signature;
        return tx;
    }
}
