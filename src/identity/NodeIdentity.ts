/**
 * Node Identity
 * Ed25519 keypair for cryptographic node identification
 * Used for validator rewards and peer authentication
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as readline from 'readline';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';

export const IDENTITY_VERSION = 1;
export const IDENTITY_ALGO = 'ed25519';
export const IDENTITY_ENCODING = 'hex';

export interface NodeIdentityData {
    version: number;          // Format version for migrations
    algo: string;             // Cryptographic algorithm (ed25519)
    encoding: string;         // Key encoding format (hex)
    nodeId: string;           // Public key (hex)
    privateKey: string;       // Private key (hex)
    rewardAddress: string | null;  // Bound wallet address for rewards
    createdAt: number;
}

export class NodeIdentity {
    private nodeId: string = '';
    private privateKey: string = '';
    private rewardAddress: string | null = null;
    private createdAt: number = 0;
    private identityPath: string;
    private isNewIdentity: boolean = false;

    constructor(dataDir: string = config.storage.dataDir) {
        this.identityPath = path.join(dataDir, 'identity.key');
    }

    // ==================== INITIALIZATION ====================

    /**
     * Initialize node identity - load existing or generate new
     */
    async init(): Promise<void> {
        if (fs.existsSync(this.identityPath)) {
            await this.loadIdentity();
            logger.info(`🔑 Node identity loaded: ${this.getShortId()}`);
        } else {
            await this.generateIdentity();
            this.isNewIdentity = true;
            await this.saveIdentity();
            logger.info(`🆕 New node identity created: ${this.getShortId()}`);
        }
    }

    /**
     * Show first-run warning for new identity
     * Call this after init() if running interactively
     */
    async showFirstRunWarning(): Promise<void> {
        if (!this.isNewIdentity) return;

        console.log('');
        console.log('╔═══════════════════════════════════════════════════════════╗');
        console.log('║           ⚠️  IMPORTANT: Node Identity Created            ║');
        console.log('╠═══════════════════════════════════════════════════════════╣');
        console.log(`║  Node ID: ${this.nodeId.slice(0, 16)}...${this.nodeId.slice(-8)}               ║`);
        console.log(`║  Backup:  ${this.identityPath.padEnd(43)} ║`);
        console.log('╠═══════════════════════════════════════════════════════════╣');
        console.log('║  This key controls your validator rewards!                ║');
        console.log('║  Keep it safe and never share your private key.          ║');
        console.log('╚═══════════════════════════════════════════════════════════╝');
        console.log('');

        // Wait for acknowledgment in interactive mode
        if (process.stdin.isTTY) {
            await this.waitForEnter();
        }
    }

    private waitForEnter(): Promise<void> {
        return new Promise((resolve) => {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
            rl.question('Press ENTER to continue...', () => {
                rl.close();
                resolve();
            });
        });
    }

    // ==================== KEY GENERATION ====================

    private async generateIdentity(): Promise<void> {
        // Generate Ed25519 keypair
        const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
            publicKeyEncoding: { type: 'spki', format: 'der' },
            privateKeyEncoding: { type: 'pkcs8', format: 'der' }
        });

        // Convert to hex for storage
        this.nodeId = publicKey.toString('hex');
        this.privateKey = privateKey.toString('hex');
        this.createdAt = Date.now();
        this.rewardAddress = null;
    }

    // ==================== STORAGE ====================

    private async loadIdentity(): Promise<void> {
        try {
            const data = fs.readFileSync(this.identityPath, 'utf-8');
            const identity: NodeIdentityData = JSON.parse(data);

            // Validate version and algorithm
            if (identity.version && identity.version > IDENTITY_VERSION) {
                throw new Error(`Identity version ${identity.version} not supported (max: ${IDENTITY_VERSION})`);
            }
            if (identity.algo && identity.algo !== IDENTITY_ALGO) {
                throw new Error(`Algorithm ${identity.algo} not supported (expected: ${IDENTITY_ALGO})`);
            }

            this.nodeId = identity.nodeId;
            this.privateKey = identity.privateKey;
            this.rewardAddress = identity.rewardAddress;
            this.createdAt = identity.createdAt;

            // Validate keypair matches (sign + verify test message)
            await this.validateKeypair();

        } catch (error) {
            throw new Error(`Failed to load identity: ${error}`);
        }
    }

    /**
     * Validate that the public key corresponds to the private key
     * by signing a test message and verifying it
     */
    private async validateKeypair(): Promise<void> {
        const testMessage = `keypair-validation-${this.createdAt}`;

        try {
            const signature = this.sign(testMessage);
            const isValid = NodeIdentity.verify(testMessage, signature, this.nodeId);

            if (!isValid) {
                throw new Error('Keypair validation failed: public key does not match private key');
            }
        } catch (error) {
            throw new Error(`Keypair validation failed: ${error}`);
        }
    }

    private async saveIdentity(): Promise<void> {
        const identity: NodeIdentityData = {
            version: IDENTITY_VERSION,
            algo: IDENTITY_ALGO,
            encoding: IDENTITY_ENCODING,
            nodeId: this.nodeId,
            privateKey: this.privateKey,
            rewardAddress: this.rewardAddress,
            createdAt: this.createdAt,
        };

        // Ensure directory exists
        const dir = path.dirname(this.identityPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Write with restricted permissions (0600)
        fs.writeFileSync(this.identityPath, JSON.stringify(identity, null, 2), { mode: 0o600 });
    }

    // ==================== REWARD ADDRESS ====================

    /**
     * Bind a wallet address for receiving rewards
     */
    async bindRewardAddress(walletAddress: string): Promise<void> {
        this.rewardAddress = walletAddress;
        await this.saveIdentity();
        logger.info(`💰 Reward address bound: ${walletAddress.slice(0, 16)}...`);
    }

    /**
     * Get the bound reward address
     */
    getRewardAddress(): string | null {
        return this.rewardAddress;
    }

    // ==================== SIGNING ====================

    /**
     * Sign a message with the node's private key
     */
    sign(message: string): string {
        const privateKeyObj = crypto.createPrivateKey({
            key: Buffer.from(this.privateKey, 'hex'),
            format: 'der',
            type: 'pkcs8'
        });

        const signature = crypto.sign(null, Buffer.from(message), privateKeyObj);
        return signature.toString('hex');
    }

    /**
     * Verify a signature from another node
     */
    static verify(message: string, signature: string, nodeId: string): boolean {
        try {
            const publicKeyObj = crypto.createPublicKey({
                key: Buffer.from(nodeId, 'hex'),
                format: 'der',
                type: 'spki'
            });

            return crypto.verify(null, Buffer.from(message), publicKeyObj, Buffer.from(signature, 'hex'));
        } catch {
            return false;
        }
    }

    // ==================== GETTERS ====================

    getNodeId(): string {
        return this.nodeId;
    }

    getShortId(): string {
        return `${this.nodeId.slice(0, 8)}...${this.nodeId.slice(-8)}`;
    }

    getCreatedAt(): number {
        return this.createdAt;
    }

    isNew(): boolean {
        return this.isNewIdentity;
    }

    /**
     * Export public identity info (safe to share)
     */
    toPublicJSON(): { nodeId: string; rewardAddress: string | null; createdAt: number } {
        return {
            nodeId: this.nodeId,
            rewardAddress: this.rewardAddress,
            createdAt: this.createdAt,
        };
    }
}

// Singleton instance
let nodeIdentity: NodeIdentity | null = null;

export async function initNodeIdentity(dataDir?: string): Promise<NodeIdentity> {
    if (!nodeIdentity) {
        nodeIdentity = new NodeIdentity(dataDir);
        await nodeIdentity.init();
    }
    return nodeIdentity;
}

export function getNodeIdentity(): NodeIdentity | null {
    return nodeIdentity;
}
