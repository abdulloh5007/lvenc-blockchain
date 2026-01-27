import * as ed from '@noble/ed25519';
import * as bip39 from 'bip39';
import HDKey from 'hdkey';
import { sha256 } from '../utils/crypto.js';
import { Transaction } from '../blockchain/Transaction.js';
import { logger } from '../utils/logger.js';
import { secureRandom } from '../security/index.js';
import { chainParams } from '../params/index.js';

// BIP-44 derivation path
// NOTE: We use the 32-byte seed from HD derivation as ed25519 private key
const BIP44_PATH = "m/44'/60'/0'/0/0";

export interface WalletData {
    privateKey: string;
    publicKey: string;
    address: string;
    mnemonic?: string;
    label?: string;
    createdAt: number;
}

export class Wallet {
    public privateKey: string;
    public publicKey: string;
    public address: string;
    public mnemonic?: string;
    public label?: string;
    public createdAt: number;

    /**
     * Create a wallet (async factory required for ed25519)
     * For sync construction, use static methods
     */
    private constructor(
        privateKey: string,
        publicKey: string,
        address: string,
        mnemonic?: string,
        label?: string
    ) {
        this.privateKey = privateKey;
        this.publicKey = publicKey;
        this.address = address;
        this.mnemonic = mnemonic;
        this.label = label;
        this.createdAt = Date.now();
    }

    /**
     * Create a new wallet with generated mnemonic
     */
    static async create(labelOrWordCount?: string | 12 | 24): Promise<Wallet> {
        let label: string | undefined;
        let wordCount: 12 | 24 = 24;

        if (typeof labelOrWordCount === 'number') {
            wordCount = labelOrWordCount;
        } else {
            label = labelOrWordCount;
        }

        // Generate mnemonic
        const entropyBytes = wordCount === 12 ? 16 : 32;
        const entropy = secureRandom(entropyBytes);
        const mnemonic = bip39.entropyToMnemonic(entropy.toString('hex'));

        // Derive keys
        const { privateKey, publicKey, address } = await Wallet.deriveKeysFromMnemonic(mnemonic);

        logger.info(`🔑 New ed25519 wallet created with ${wordCount}-word mnemonic`);

        const wallet = new Wallet(privateKey, publicKey, address, mnemonic, label);
        return wallet;
    }

    /**
     * Import wallet from mnemonic
     */
    static async fromMnemonic(mnemonic: string, label?: string): Promise<Wallet> {
        const normalized = mnemonic.trim().toLowerCase();
        if (!bip39.validateMnemonic(normalized)) {
            throw new Error('Invalid mnemonic phrase');
        }

        const { privateKey, publicKey, address } = await Wallet.deriveKeysFromMnemonic(normalized);
        return new Wallet(privateKey, publicKey, address, mnemonic.trim(), label);
    }

    /**
     * Import wallet from private key
     */
    static async fromPrivateKey(privateKeyHex: string, label?: string): Promise<Wallet> {
        const publicKeyBytes = await ed.getPublicKeyAsync(Wallet.hexToBytes(privateKeyHex));
        const publicKey = Wallet.bytesToHex(publicKeyBytes);
        const address = Wallet.deriveAddress(publicKey);
        return new Wallet(privateKeyHex, publicKey, address, undefined, label);
    }

    /**
     * Derive keys from mnemonic using BIP-44 path
     */
    private static async deriveKeysFromMnemonic(mnemonic: string): Promise<{
        privateKey: string;
        publicKey: string;
        address: string;
    }> {
        const seed = bip39.mnemonicToSeedSync(mnemonic);
        const hdkey = HDKey.fromMasterSeed(seed);
        const child = hdkey.derive(BIP44_PATH);

        if (!child.privateKey) {
            throw new Error('Failed to derive private key from mnemonic');
        }

        // Use first 32 bytes of derived key as ed25519 seed
        const privateKey = child.privateKey.toString('hex').substring(0, 64);

        // Derive ed25519 public key
        const privateKeyBytes = Wallet.hexToBytes(privateKey);
        const publicKeyBytes = await ed.getPublicKeyAsync(privateKeyBytes);
        const publicKey = Wallet.bytesToHex(publicKeyBytes);

        // Derive address: prefix + sha256(publicKey).substring(0, 40)
        const address = Wallet.deriveAddress(publicKey);

        return { privateKey, publicKey, address };
    }

    /**
     * Derive address from ed25519 public key
     * Format: {prefix} + sha256(publicKey)[0:40]
     */
    private static deriveAddress(publicKey: string): string {
        const prefix = chainParams.addressPrefix;
        return prefix + sha256(publicKey).substring(0, 40);
    }

    // Helper: hex to bytes
    private static hexToBytes(hex: string): Uint8Array {
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < bytes.length; i++) {
            bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
        }
        return bytes;
    }

    // Helper: bytes to hex
    private static bytesToHex(bytes: Uint8Array): string {
        return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    getShortAddress(): string {
        return `${this.address.substring(0, 10)}...${this.address.substring(this.address.length - 6)}`;
    }

    /**
     * Sign transaction with ed25519
     */
    async signTransaction(transaction: Transaction): Promise<void> {
        if (transaction.fromAddress !== this.address) {
            throw new Error('Cannot sign transactions for other wallets');
        }
        await transaction.signEd25519(this.privateKey);
    }

    /**
     * Create and sign transaction
     */
    async createTransaction(toAddress: string, amount: number, fee: number = 0): Promise<Transaction> {
        const transaction = new Transaction(this.address, toAddress, amount, fee);
        await this.signTransaction(transaction);
        return transaction;
    }

    /**
     * Verify message with ed25519
     */
    async verify(message: string, signature: string): Promise<boolean> {
        try {
            const messageBytes = new TextEncoder().encode(message);
            const signatureBytes = Wallet.hexToBytes(signature);
            const publicKeyBytes = Wallet.hexToBytes(this.publicKey);
            return await ed.verifyAsync(signatureBytes, messageBytes, publicKeyBytes);
        } catch {
            return false;
        }
    }

    export(): WalletData {
        return {
            privateKey: this.privateKey,
            publicKey: this.publicKey,
            address: this.address,
            mnemonic: this.mnemonic,
            label: this.label,
            createdAt: this.createdAt,
        };
    }

    exportPublic(): Omit<WalletData, 'privateKey' | 'mnemonic'> {
        return {
            publicKey: this.publicKey,
            address: this.address,
            label: this.label,
            createdAt: this.createdAt,
        };
    }

    /**
     * Import wallet from data (async)
     */
    static async import(data: WalletData): Promise<Wallet> {
        let wallet: Wallet;
        if (data.mnemonic) {
            wallet = await Wallet.fromMnemonic(data.mnemonic, data.label);
        } else {
            wallet = await Wallet.fromPrivateKey(data.privateKey, data.label);
        }
        wallet.createdAt = data.createdAt;
        return wallet;
    }

    static validateMnemonic(mnemonic: string): boolean {
        return bip39.validateMnemonic(mnemonic.trim());
    }
}

