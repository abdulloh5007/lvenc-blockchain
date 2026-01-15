import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { BlockchainData } from '../blockchain/index.js';
import {
    StakeInfo,
    ValidatorInfo,
    UnstakeRequest,
    Delegation,
    PendingStake,
    PendingDelegation
} from '../staking/StakingPool.js';
import { logger } from '../utils/logger.js';

export interface StakingData {
    currentEpoch?: number;
    epochStartBlock?: number;
    epochStartTime?: number;
    stakes: StakeInfo[];
    validators: ValidatorInfo[];
    delegations?: Record<string, Delegation[]>;
    validatorDelegations?: Record<string, number>;
    pendingStakes?: PendingStake[];
    pendingDelegations?: PendingDelegation[];
    pendingUnstakes?: Record<string, UnstakeRequest[]>;
    // Legacy compatibility
    unstakeRequests?: Record<string, UnstakeRequest[]>;
}

export class Storage {
    private dataDir: string;
    private blocksPath: string;
    private stakingPath: string;

    constructor() {
        this.dataDir = config.storage.dataDir;
        this.blocksPath = path.join(this.dataDir, config.storage.blocksFile);
        this.stakingPath = path.join(this.dataDir, 'staking.json');
        this.ensureDirectories();
    }

    private ensureDirectories(): void {
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
    }

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

    saveStaking(data: StakingData): void {
        fs.writeFileSync(this.stakingPath, JSON.stringify(data, null, 2));
        logger.debug('💾 Staking data saved to disk');
    }

    loadStaking(): StakingData | null {
        if (!fs.existsSync(this.stakingPath)) {
            return null;
        }
        try {
            const content = fs.readFileSync(this.stakingPath, 'utf-8');
            return JSON.parse(content);
        } catch (error) {
            logger.error('Failed to load staking:', error);
            return null;
        }
    }
}

export const storage = new Storage();
