import elliptic from 'elliptic';
import * as bip39 from 'bip39';
import HDKey from 'hdkey';
import { sha256, publicKeyToAddress } from '../utils/crypto.js';
import { Transaction } from '../blockchain/Transaction.js';
import { logger } from '../utils/logger.js';
import { secureRandom } from '../security/index.js';

const ec = new elliptic.ec('secp256k1');

// BIP-44 derivation path for Ethereum-compatible wallets
// m/44'/60'/0'/0/0 - standard for ETH, allows import to MetaMask, Trust Wallet, etc.
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

    private keyPair: elliptic.ec.KeyPair;

    /**
     * Create a wallet
     * @param privateKeyOrMnemonic - Private key hex, mnemonic phrase, or undefined to generate new
     * @param labelOrWordCount - Wallet label (string) or word count for new wallet (12 or 24)
     */
    constructor(privateKeyOrMnemonic?: string, labelOrWordCount?: string | 12 | 24) {
        // Determine if second param is label or word count
        let label: string | undefined;
        let wordCount: 12 | 24 = 24;

        if (typeof labelOrWordCount === 'number') {
            wordCount = labelOrWordCount;
        } else {
            label = labelOrWordCount;
        }

        if (privateKeyOrMnemonic) {
            if (privateKeyOrMnemonic.includes(' ')) {
                // Mnemonic phrase - use BIP-44 derivation
                const mnemonic = privateKeyOrMnemonic.trim();
                if (!bip39.validateMnemonic(mnemonic)) {
                    throw new Error('Invalid mnemonic phrase');
                }
                this.mnemonic = mnemonic;
                const privateKeyHex = this.derivePrivateKey(mnemonic);
                this.keyPair = ec.keyFromPrivate(privateKeyHex, 'hex');
                this.privateKey = privateKeyHex;
            } else {
                // Direct private key
                this.keyPair = ec.keyFromPrivate(privateKeyOrMnemonic, 'hex');
                this.privateKey = privateKeyOrMnemonic;
            }
        } else {
            // Generate new wallet with specified word count
            // 12 words = 16 bytes (128 bits), 24 words = 32 bytes (256 bits)
            const entropyBytes = wordCount === 12 ? 16 : 32;
            const entropy = secureRandom(entropyBytes);
            this.mnemonic = bip39.entropyToMnemonic(entropy.toString('hex'));
            const privateKeyHex = this.derivePrivateKey(this.mnemonic);
            this.keyPair = ec.keyFromPrivate(privateKeyHex, 'hex');
            this.privateKey = privateKeyHex;
            logger.info(`🔑 New wallet created with ${wordCount}-word mnemonic`);
        }

        this.publicKey = this.keyPair.getPublic('hex');
        this.address = publicKeyToAddress(this.publicKey);
        this.label = label;
        this.createdAt = Date.now();
    }

    /**
     * Derive private key from mnemonic using BIP-44 standard path
     * This ensures compatibility with external wallets (MetaMask, Trust Wallet, etc.)
     */
    private derivePrivateKey(mnemonic: string): string {
        const seed = bip39.mnemonicToSeedSync(mnemonic);
        const hdkey = HDKey.fromMasterSeed(seed);
        const child = hdkey.derive(BIP44_PATH);
        if (!child.privateKey) {
            throw new Error('Failed to derive private key from mnemonic');
        }
        return child.privateKey.toString('hex');
    }

    getShortAddress(): string {
        return `${this.address.substring(0, 10)}...${this.address.substring(this.address.length - 6)}`;
    }

    signTransaction(transaction: Transaction): void {
        if (transaction.fromAddress !== this.address) {
            throw new Error('Cannot sign transactions for other wallets');
        }
        const hash = transaction.calculateHash();
        const signature = this.keyPair.sign(hash, 'base64');
        transaction.signature = signature.toDER('hex');
    }

    createTransaction(toAddress: string, amount: number, fee: number = 0): Transaction {
        const transaction = new Transaction(this.address, toAddress, amount, fee);
        this.signTransaction(transaction);
        return transaction;
    }

    verify(message: string, signature: string): boolean {
        try {
            return this.keyPair.verify(message, signature);
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

    static import(data: WalletData): Wallet {
        const wallet = new Wallet(data.mnemonic || data.privateKey, data.label);
        wallet.createdAt = data.createdAt;
        return wallet;
    }

    static fromMnemonic(mnemonic: string, label?: string): Wallet {
        return new Wallet(mnemonic, label);
    }

    static validateMnemonic(mnemonic: string): boolean {
        return bip39.validateMnemonic(mnemonic.trim());
    }
}
