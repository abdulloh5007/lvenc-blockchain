/**
 * Validator Key
 * 
 * Ed25519 keypair for block signing (consensus).
 * Separate from NodeIdentity (P2P) and Wallet keys.
 * 
 * Stored as: data/{network}/priv_validator_key.json
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { logger } from '../utils/logger.js';

export const VALIDATOR_KEY_VERSION = 1;
export const VALIDATOR_KEY_FILE = 'priv_validator_key.json';

/**
 * Derive validator address from public key hex.
 * Same algorithm as UnifiedIdentity and Wallet use.
 * @param pubKeyHex - Hex-encoded public key
 * @returns Address (first 40 chars of sha256 hash of hex string, lowercase)
 */
export function deriveAddressFromPubKey(pubKeyHex: string): string {
    // MUST match UnifiedIdentity.deriveAddress and Wallet.deriveAddress exactly!
    // Hash the HEX STRING directly (not bytes) for compatibility
    const hash = crypto.createHash('sha256').update(pubKeyHex).digest('hex');
    return hash.slice(0, 40);
}

export interface ValidatorKeyData {
    version: number;
    address: string;           // Derived from pubkey (for identification)
    pub_key: {
        type: 'ed25519';
        value: string;         // Hex-encoded public key
    };
    priv_key: {
        type: 'ed25519';
        value: string;         // Hex-encoded private key
    };
    created_at: number;
}

export class ValidatorKey {
    private address: string = '';
    private pubKey: string = '';
    private privKey: string = '';
    private createdAt: number = 0;
    private keyPath: string;
    private log = logger.child('ValidatorKey');

    constructor(dataDir: string) {
        this.keyPath = path.join(dataDir, VALIDATOR_KEY_FILE);
    }

    /**
     * Initialize - load existing or generate new key
     */
    async init(): Promise<void> {
        if (fs.existsSync(this.keyPath)) {
            await this.load();
            this.log.info(`◆ Validator key loaded: ${this.getShortAddress()}`);
        } else {
            await this.generate();
            await this.save();
            this.log.info(`+ New validator key created: ${this.getShortAddress()}`);
        }
    }

    /**
     * Generate new Ed25519 keypair
     */
    private async generate(): Promise<void> {
        const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
            publicKeyEncoding: { type: 'spki', format: 'der' },
            privateKeyEncoding: { type: 'pkcs8', format: 'der' }
        });

        this.pubKey = publicKey.toString('hex');
        this.privKey = privateKey.toString('hex');
        this.createdAt = Date.now();

        // Derive address from public key (first 40 chars of sha256)
        const hash = crypto.createHash('sha256').update(publicKey).digest('hex');
        this.address = hash.slice(0, 40).toUpperCase();
    }

    /**
     * Load key from file
     */
    private async load(): Promise<void> {
        const data = fs.readFileSync(this.keyPath, 'utf-8');
        const key: ValidatorKeyData = JSON.parse(data);

        if (key.version > VALIDATOR_KEY_VERSION) {
            throw new Error(`Unsupported key version: ${key.version}`);
        }

        this.address = key.address;
        this.pubKey = key.pub_key.value;
        this.privKey = key.priv_key.value;
        this.createdAt = key.created_at;

        // Validate keypair
        await this.validate();
    }

    /**
     * Validate that pubkey and privkey match
     */
    private async validate(): Promise<void> {
        const testMsg = `validate-${this.createdAt}`;
        const sig = this.sign(testMsg);
        const valid = ValidatorKey.verify(testMsg, sig, this.pubKey);

        if (!valid) {
            throw new Error('Validator key validation failed: keypair mismatch');
        }
    }

    /**
     * Save key to file
     */
    private async save(): Promise<void> {
        const data: ValidatorKeyData = {
            version: VALIDATOR_KEY_VERSION,
            address: this.address,
            pub_key: {
                type: 'ed25519',
                value: this.pubKey
            },
            priv_key: {
                type: 'ed25519',
                value: this.privKey
            },
            created_at: this.createdAt
        };

        // Ensure directory exists
        const dir = path.dirname(this.keyPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Write with restricted permissions
        fs.writeFileSync(this.keyPath, JSON.stringify(data, null, 2), { mode: 0o600 });
    }

    /**
     * Sign a message
     */
    sign(message: string): string {
        const privateKeyObj = crypto.createPrivateKey({
            key: Buffer.from(this.privKey, 'hex'),
            format: 'der',
            type: 'pkcs8'
        });

        const signature = crypto.sign(null, Buffer.from(message), privateKeyObj);
        return signature.toString('hex');
    }

    /**
     * Verify a signature (static)
     */
    static verify(message: string, signature: string, pubKey: string): boolean {
        try {
            const publicKeyObj = crypto.createPublicKey({
                key: Buffer.from(pubKey, 'hex'),
                format: 'der',
                type: 'spki'
            });

            return crypto.verify(
                null,
                Buffer.from(message),
                publicKeyObj,
                Buffer.from(signature, 'hex')
            );
        } catch {
            return false;
        }
    }

    // ========== GETTERS ==========

    getAddress(): string {
        return this.address;
    }

    getShortAddress(): string {
        return `${this.address.slice(0, 8)}...${this.address.slice(-8)}`;
    }

    getPubKey(): string {
        return this.pubKey;
    }

    getCreatedAt(): number {
        return this.createdAt;
    }

    /**
     * Export public info (safe to share)
     */
    toPublicJSON(): { address: string; pubKey: string; createdAt: number } {
        return {
            address: this.address,
            pubKey: this.pubKey,
            createdAt: this.createdAt
        };
    }
}

// Singleton
let validatorKey: ValidatorKey | null = null;

export async function initValidatorKey(dataDir: string): Promise<ValidatorKey> {
    if (!validatorKey) {
        validatorKey = new ValidatorKey(dataDir);
        await validatorKey.init();
    }
    return validatorKey;
}

export function getValidatorKey(): ValidatorKey | null {
    return validatorKey;
}
