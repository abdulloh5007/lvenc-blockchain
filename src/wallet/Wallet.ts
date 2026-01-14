import elliptic from 'elliptic';
import * as bip39 from 'bip39';
import { sha256, publicKeyToAddress } from '../utils/crypto.js';
import { Transaction } from '../blockchain/Transaction.js';
import { logger } from '../utils/logger.js';

const ec = new elliptic.ec('secp256k1');

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

    constructor(privateKeyOrMnemonic?: string, label?: string) {
        if (privateKeyOrMnemonic) {
            if (privateKeyOrMnemonic.includes(' ')) {
                const mnemonic = privateKeyOrMnemonic.trim();
                if (!bip39.validateMnemonic(mnemonic)) {
                    throw new Error('Invalid mnemonic phrase');
                }
                this.mnemonic = mnemonic;
                const seed = bip39.mnemonicToSeedSync(mnemonic);
                const privateKeyHex = sha256(seed.toString('hex')).substring(0, 64);
                this.keyPair = ec.keyFromPrivate(privateKeyHex, 'hex');
                this.privateKey = privateKeyHex;
            } else {
                this.keyPair = ec.keyFromPrivate(privateKeyOrMnemonic, 'hex');
                this.privateKey = privateKeyOrMnemonic;
            }
        } else {
            this.mnemonic = bip39.generateMnemonic(160);
            const seed = bip39.mnemonicToSeedSync(this.mnemonic);
            const privateKeyHex = sha256(seed.toString('hex')).substring(0, 64);
            this.keyPair = ec.keyFromPrivate(privateKeyHex, 'hex');
            this.privateKey = privateKeyHex;
            logger.info(`🔑 New wallet created with 15-word mnemonic`);
        }

        this.publicKey = this.keyPair.getPublic('hex');
        this.address = publicKeyToAddress(this.publicKey);
        this.label = label;
        this.createdAt = Date.now();
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
