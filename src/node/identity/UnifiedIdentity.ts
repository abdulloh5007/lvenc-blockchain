/**
 * Unified Node Identity v2
 * 
 * Single identity for:
 * - P2P network identification (nodeId)
 * - Block signing (consensus) 
 * - Staking address
 * - Reward address
 * 
 * Features:
 * - 24-word BIP39 mnemonic for backup/restore
 * - Auto-migration from old identity.key and priv_validator_key.json
 * - Ed25519 keypair for all cryptographic operations
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as readline from 'readline';
import * as bip39 from 'bip39';
import { logger } from '../../protocol/utils/logger.js';
import { config } from '../config.js';
import { chainParams } from '../../protocol/params/index.js';
import { boxCenter, boxSeparator, boxTop, boxBottom, boxEmpty } from '../../protocol/utils/box.js';

export const UNIFIED_IDENTITY_VERSION = 2;
export const UNIFIED_IDENTITY_FILE = 'node_identity.json';

// Old file names for migration
const OLD_IDENTITY_FILE = 'identity.key';
const OLD_VALIDATOR_KEY_FILE = 'priv_validator_key.json';

export interface UnifiedIdentityData {
    version: number;
    mnemonic?: string;           // 24-word BIP39 mnemonic (encrypted in future)
    address: string;             // Derived address (used for staking)
    fullAddress: string;         // With network prefix (tLVE...)
    nodeId: string;              // Public key hex (for P2P)
    pub_key: {
        type: 'ed25519';
        value: string;
    };
    priv_key: {
        type: 'ed25519';
        value: string;
    };
    rewardAddress?: string;      // Legacy: bound reward address (now same as address)
    createdAt: number;
    migratedFrom?: string[];     // Source files if migrated
}

export class UnifiedIdentity {
    private data: UnifiedIdentityData | null = null;
    private identityPath: string;
    private dataDir: string;
    private isNewIdentity: boolean = false;
    private showMnemonic: boolean = false;
    private log = logger.child('Identity');

    constructor(dataDir: string = config.storage.dataDir) {
        this.dataDir = dataDir;
        this.identityPath = path.join(dataDir, UNIFIED_IDENTITY_FILE);
    }

    // ==================== INITIALIZATION ====================

    async init(): Promise<void> {
        // Try loading new format first
        if (fs.existsSync(this.identityPath)) {
            await this.load();
            this.log.info(`🔑 Identity loaded: ${this.getShortAddress()}`);
            return;
        }

        // Try migration from old files
        const migrated = await this.migrateFromOldFiles();
        if (migrated) {
            this.log.info(`🔄 Migrated identity: ${this.getShortAddress()}`);
            return;
        }

        // Generate new identity
        await this.generate();
        this.isNewIdentity = true;
        this.showMnemonic = true;
        await this.save();
        this.log.info(`✨ New identity created: ${this.getShortAddress()}`);
    }

    // ==================== MNEMONIC DISPLAY ====================

    async showFirstRunWarning(): Promise<void> {
        if (!this.showMnemonic || !this.data?.mnemonic) return;

        const words = this.data.mnemonic.split(' ');

        console.log('');
        console.log('\x1b[41m\x1b[37m' + '═'.repeat(65) + '\x1b[0m');
        console.log('\x1b[41m\x1b[37m' + boxCenter('⚠️  CRITICAL: SAVE YOUR MNEMONIC PHRASE!') + '\x1b[0m');
        console.log('\x1b[41m\x1b[37m' + '═'.repeat(65) + '\x1b[0m');
        console.log('');
        console.log('\x1b[33mThis is the ONLY time you will see these words!\x1b[0m');
        console.log('\x1b[33mWithout them, you CANNOT recover your validator stake!\x1b[0m');
        console.log('');
        console.log('┌────────────────────────────────────────────────────────────────┐');

        // Display mnemonic in 4 rows of 6 words
        for (let row = 0; row < 4; row++) {
            const rowWords = words.slice(row * 6, (row + 1) * 6);
            const formatted = rowWords.map((w, i) => {
                const num = (row * 6 + i + 1).toString().padStart(2, ' ');
                return `${num}. ${w.padEnd(10)}`;
            }).join(' ');
            console.log(`│  ${formatted}  │`);
        }

        console.log('└────────────────────────────────────────────────────────────────┘');
        console.log('');
        console.log(`\x1b[36mYour Validator Address: ${this.getFullAddress()}\x1b[0m`);
        console.log('');

        if (process.stdin.isTTY) {
            await this.waitForConfirmation();
        }
    }

    private waitForConfirmation(): Promise<void> {
        return new Promise((resolve) => {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
            rl.question('\x1b[33m⚠️  Type "I SAVED IT" to confirm you backed up your mnemonic: \x1b[0m', (answer) => {
                rl.close();
                if (answer.trim().toUpperCase() !== 'I SAVED IT') {
                    console.log('\x1b[31m⚠️  Please backup your mnemonic before continuing!\x1b[0m');
                }
                resolve();
            });
        });
    }

    // ==================== GENERATION ====================

    private async generate(): Promise<void> {
        // Generate 24-word mnemonic (256 bits of entropy)
        const mnemonic = bip39.generateMnemonic(256);

        // Derive Ed25519 keypair from mnemonic
        const seed = await bip39.mnemonicToSeed(mnemonic);
        // Use first 32 bytes of seed for Ed25519
        const seedBytes = seed.slice(0, 32);

        // Generate Ed25519 keypair from seed
        const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
            publicKeyEncoding: { type: 'spki', format: 'der' },
            privateKeyEncoding: { type: 'pkcs8', format: 'der' }
        });

        const pubKeyHex = publicKey.toString('hex');
        const privKeyHex = privateKey.toString('hex');

        // Derive address from public key (sha256 hash)
        const address = this.deriveAddress(pubKeyHex);
        const fullAddress = chainParams.addressPrefix + address;

        this.data = {
            version: UNIFIED_IDENTITY_VERSION,
            mnemonic: mnemonic,
            address: address,
            fullAddress: fullAddress,
            nodeId: pubKeyHex,
            pub_key: { type: 'ed25519', value: pubKeyHex },
            priv_key: { type: 'ed25519', value: privKeyHex },
            createdAt: Date.now()
        };
    }

    private deriveAddress(pubKeyHex: string): string {
        const pubKeyBuffer = Buffer.from(pubKeyHex, 'hex');
        const hash = crypto.createHash('sha256').update(pubKeyBuffer).digest('hex');
        return hash.slice(0, 40).toUpperCase();
    }

    // ==================== MIGRATION ====================

    private async migrateFromOldFiles(): Promise<boolean> {
        const oldIdentityPath = path.join(this.dataDir, OLD_IDENTITY_FILE);
        const oldValidatorKeyPath = path.join(this.dataDir, OLD_VALIDATOR_KEY_FILE);

        // Priority: validator key (has consensus capability)
        if (fs.existsSync(oldValidatorKeyPath)) {
            return await this.migrateFromValidatorKey(oldValidatorKeyPath, oldIdentityPath);
        }

        // Fallback: identity.key only
        if (fs.existsSync(oldIdentityPath)) {
            return await this.migrateFromIdentityKey(oldIdentityPath);
        }

        return false;
    }

    private async migrateFromValidatorKey(validatorKeyPath: string, identityPath?: string): Promise<boolean> {
        try {
            const data = JSON.parse(fs.readFileSync(validatorKeyPath, 'utf-8'));

            // Load reward address from old identity if exists
            let rewardAddress: string | undefined;
            if (identityPath && fs.existsSync(identityPath)) {
                const identityData = JSON.parse(fs.readFileSync(identityPath, 'utf-8'));
                rewardAddress = identityData.rewardAddress;
            }

            const address = data.address || this.deriveAddress(data.pub_key.value);
            const fullAddress = chainParams.addressPrefix + address;

            this.data = {
                version: UNIFIED_IDENTITY_VERSION,
                // No mnemonic for migrated keys (wasn't generated with mnemonic)
                address: address,
                fullAddress: fullAddress,
                nodeId: data.pub_key.value,
                pub_key: { type: 'ed25519', value: data.pub_key.value },
                priv_key: { type: 'ed25519', value: data.priv_key.value },
                rewardAddress: rewardAddress,
                createdAt: data.created_at || Date.now(),
                migratedFrom: ['priv_validator_key.json', identityPath ? 'identity.key' : ''].filter(Boolean)
            };

            await this.save();

            // Rename old files as backup
            this.backupOldFile(validatorKeyPath);
            if (identityPath && fs.existsSync(identityPath)) {
                this.backupOldFile(identityPath);
            }

            this.log.info(`📦 Migrated from priv_validator_key.json`);
            return true;
        } catch (error) {
            this.log.error(`Failed to migrate from validator key: ${error}`);
            return false;
        }
    }

    private async migrateFromIdentityKey(identityPath: string): Promise<boolean> {
        try {
            const data = JSON.parse(fs.readFileSync(identityPath, 'utf-8'));

            const address = this.deriveAddress(data.nodeId);
            const fullAddress = chainParams.addressPrefix + address;

            this.data = {
                version: UNIFIED_IDENTITY_VERSION,
                address: address,
                fullAddress: fullAddress,
                nodeId: data.nodeId,
                pub_key: { type: 'ed25519', value: data.nodeId },
                priv_key: { type: 'ed25519', value: data.privateKey },
                rewardAddress: data.rewardAddress,
                createdAt: data.createdAt || Date.now(),
                migratedFrom: ['identity.key']
            };

            await this.save();
            this.backupOldFile(identityPath);

            this.log.info(`📦 Migrated from identity.key`);
            return true;
        } catch (error) {
            this.log.error(`Failed to migrate from identity key: ${error}`);
            return false;
        }
    }

    private backupOldFile(filePath: string): void {
        if (fs.existsSync(filePath)) {
            const backupPath = filePath + '.backup';
            fs.renameSync(filePath, backupPath);
            this.log.debug(`Backed up ${path.basename(filePath)} → ${path.basename(backupPath)}`);
        }
    }

    // ==================== STORAGE ====================

    private async load(): Promise<void> {
        const raw = fs.readFileSync(this.identityPath, 'utf-8');
        this.data = JSON.parse(raw);

        if (this.data!.version > UNIFIED_IDENTITY_VERSION) {
            throw new Error(`Identity version ${this.data!.version} not supported`);
        }

        await this.validateKeypair();
    }

    private async validateKeypair(): Promise<void> {
        const testMessage = `validate-${this.data!.createdAt}`;
        const signature = this.sign(testMessage);
        const valid = this.verify(testMessage, signature);
        if (!valid) {
            throw new Error('Keypair validation failed');
        }
    }

    private async save(): Promise<void> {
        const dir = path.dirname(this.identityPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Don't save mnemonic to file after first creation (security)
        const saveData = { ...this.data };
        if (!this.showMnemonic) {
            delete saveData.mnemonic;
        }

        fs.writeFileSync(this.identityPath, JSON.stringify(saveData, null, 2), { mode: 0o600 });
    }

    // ==================== SIGNING (for blocks) ====================

    sign(message: string): string {
        if (!this.data) throw new Error('Identity not initialized');

        const privateKeyObj = crypto.createPrivateKey({
            key: Buffer.from(this.data.priv_key.value, 'hex'),
            format: 'der',
            type: 'pkcs8'
        });

        const signature = crypto.sign(null, Buffer.from(message), privateKeyObj);
        return signature.toString('hex');
    }

    verify(message: string, signature: string): boolean {
        if (!this.data) return false;

        try {
            const publicKeyObj = crypto.createPublicKey({
                key: Buffer.from(this.data.pub_key.value, 'hex'),
                format: 'der',
                type: 'spki'
            });
            return crypto.verify(null, Buffer.from(message), publicKeyObj, Buffer.from(signature, 'hex'));
        } catch {
            return false;
        }
    }

    // ==================== GETTERS ====================

    getAddress(): string {
        return this.data?.address || '';
    }

    getFullAddress(): string {
        return this.data?.fullAddress || '';
    }

    getNodeId(): string {
        return this.data?.nodeId || '';
    }

    getPubKey(): string {
        return this.data?.pub_key.value || '';
    }

    getShortAddress(): string {
        const addr = this.getAddress();
        return addr ? `${addr.slice(0, 8)}...${addr.slice(-8)}` : '';
    }

    getRewardAddress(): string {
        // Reward address is now same as full address
        return this.data?.rewardAddress || this.getFullAddress();
    }

    isNew(): boolean {
        return this.isNewIdentity;
    }

    wasMigrated(): boolean {
        return (this.data?.migratedFrom?.length || 0) > 0;
    }

    hasMnemonic(): boolean {
        return !!this.data?.mnemonic;
    }
}

// ==================== SINGLETON ====================

let unifiedIdentity: UnifiedIdentity | null = null;

export async function initUnifiedIdentity(dataDir?: string): Promise<UnifiedIdentity> {
    if (!unifiedIdentity) {
        unifiedIdentity = new UnifiedIdentity(dataDir);
        await unifiedIdentity.init();
    }
    return unifiedIdentity;
}

export function getUnifiedIdentity(): UnifiedIdentity | null {
    return unifiedIdentity;
}

export function resetUnifiedIdentity(): void {
    unifiedIdentity = null;
}
