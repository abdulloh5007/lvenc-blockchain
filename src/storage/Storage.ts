import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { BlockchainData } from '../blockchain/index.js';
import { WalletData } from '../wallet/index.js';
import { logger } from '../utils/logger.js';

export class Storage {
    private dataDir: string;
    private blocksPath: string;
    private walletsDir: string;

    constructor() {
        this.dataDir = config.storage.dataDir;
        this.blocksPath = path.join(this.dataDir, config.storage.blocksFile);
        this.walletsDir = path.join(this.dataDir, config.storage.walletsDir);
        this.ensureDirectories();
    }

    private ensureDirectories(): void {
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
        if (!fs.existsSync(this.walletsDir)) {
            fs.mkdirSync(this.walletsDir, { recursive: true });
        }
    }

    // Blockchain storage
    saveBlockchain(data: BlockchainData): void {
        fs.writeFileSync(this.blocksPath, JSON.stringify(data, null, 2));
        logger.debug('💾 Blockchain saved to disk');
    }

    loadBlockchain(): BlockchainData | null {
        if (!fs.existsSync(this.blocksPath)) {
            return null;
        }
        try {
            const content = fs.readFileSync(this.blocksPath, 'utf-8');
            return JSON.parse(content);
        } catch (error) {
            logger.error('Failed to load blockchain:', error);
            return null;
        }
    }

    // Wallet storage
    saveWallet(wallet: WalletData): void {
        const walletPath = path.join(this.walletsDir, `${wallet.address}.json`);
        fs.writeFileSync(walletPath, JSON.stringify(wallet, null, 2));
        logger.debug(`💾 Wallet ${wallet.address.substring(0, 10)}... saved`);
    }

    loadWallet(address: string): WalletData | null {
        const walletPath = path.join(this.walletsDir, `${address}.json`);
        if (!fs.existsSync(walletPath)) {
            return null;
        }
        try {
            const content = fs.readFileSync(walletPath, 'utf-8');
            return JSON.parse(content);
        } catch (error) {
            logger.error('Failed to load wallet:', error);
            return null;
        }
    }

    listWallets(): WalletData[] {
        if (!fs.existsSync(this.walletsDir)) {
            return [];
        }
        const files = fs.readdirSync(this.walletsDir);
        return files
            .filter(f => f.endsWith('.json'))
            .map(f => {
                const content = fs.readFileSync(path.join(this.walletsDir, f), 'utf-8');
                return JSON.parse(content);
            });
    }

    deleteWallet(address: string): boolean {
        const walletPath = path.join(this.walletsDir, `${address}.json`);
        if (fs.existsSync(walletPath)) {
            fs.unlinkSync(walletPath);
            return true;
        }
        return false;
    }
}

export const storage = new Storage();
