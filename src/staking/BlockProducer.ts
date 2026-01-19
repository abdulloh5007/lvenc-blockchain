import { Blockchain, Transaction } from '../blockchain/index.js';
import { stakingPool } from './StakingPool.js';
import { vrfSelector } from './VRFSelector.js';
import { slashingManager } from './SlashingManager.js';
import { storage } from '../storage/index.js';
import { logger } from '../utils/logger.js';
import { sha256 } from '../utils/crypto.js';
import { config } from '../config.js';

const SLOT_DURATION = 30000;

export class BlockProducer {
    private blockchain: Blockchain;
    private intervalId: NodeJS.Timeout | null = null;
    private isRunning = false;
    private lastProducedSlot = -1;
    private log = logger.child('BlockProducer');

    constructor(blockchain: Blockchain) {
        this.blockchain = blockchain;
    }

    start(): void {
        if (this.isRunning) {
            this.log.warn('Block producer already running');
            return;
        }
        this.isRunning = true;
        this.log.info(`🚀 Block producer started (slot duration: ${SLOT_DURATION / 1000}s)`);
        this.scheduleNextSlot();
    }

    stop(): void {
        if (this.intervalId) {
            clearTimeout(this.intervalId);
            this.intervalId = null;
        }
        this.isRunning = false;
        this.log.info('⏹️ Block producer stopped');
    }

    private scheduleNextSlot(): void {
        if (!this.isRunning) return;
        const timeUntilNext = vrfSelector.getTimeUntilNextSlot();
        this.intervalId = setTimeout(() => {
            this.produceBlockForSlot();
            this.scheduleNextSlot();
        }, timeUntilNext + 100);
    }

    private produceBlockForSlot(): void {
        const currentSlot = vrfSelector.getCurrentSlot();
        if (currentSlot <= this.lastProducedSlot) {
            this.log.debug(`Slot ${currentSlot} already processed`);
            return;
        }

        const validators = stakingPool.getValidators().filter(v => v.isActive);
        if (validators.length === 0) {
            this.log.debug('No active validators, skipping slot');
            return;
        }

        const latestBlock = this.blockchain.getLatestBlock();
        const currentBlockIndex = latestBlock.index + 1;

        // Check for epoch transition
        if (stakingPool.shouldTransitionEpoch(currentBlockIndex)) {
            stakingPool.transitionEpoch(currentBlockIndex);
            storage.saveStaking(stakingPool.toJSON());
            this.log.info(`🔄 Epoch transition completed at block ${currentBlockIndex}`);
        }

        const seed = vrfSelector.generateSeed(latestBlock.hash, currentSlot);

        // Apply stake penalty for outdated protocol version
        // Validators running outdated nodes have reduced weight in selection
        const graceUntilBlock = config.version.graceUntilBlock;
        const applyOutdatedPenalty = graceUntilBlock && currentBlockIndex < graceUntilBlock;

        // Include delegated stake in validator selection with optional penalty
        const validatorList = validators.map(v => {
            let effectiveStake = v.stake + v.delegatedStake;

            // If network is in grace period and this is our node's stake,
            // apply 50% penalty to incentivize upgrades
            if (applyOutdatedPenalty) {
                effectiveStake = Math.floor(effectiveStake * 0.5);
                this.log.debug(`⚠️ Outdated node penalty applied: ${v.address.slice(0, 10)}... stake reduced by 50%`);
            }

            return {
                address: v.address,
                stake: effectiveStake
            };
        });
        const validatorAddress = vrfSelector.selectValidator(validatorList, seed);

        if (!validatorAddress) {
            this.log.warn('Failed to select validator');
            return;
        }

        try {
            const signFn = (hash: string): string => {
                return sha256(validatorAddress + hash + currentSlot.toString());
            };
            const block = this.blockchain.createPoSBlock(validatorAddress, signFn);
            (block as { slotNumber?: number }).slotNumber = currentSlot;

            // Record block signature for double-sign detection
            const blockSignature = sha256(block.hash + validatorAddress + currentSlot.toString());
            const isValidSignature = slashingManager.recordBlockSignature(currentSlot, validatorAddress, blockSignature);

            if (!isValidSignature) {
                this.log.error(`🔪 Double-sign detected for validator ${validatorAddress.slice(0, 12)}... at slot ${currentSlot}!`);
                // Block is rejected, validator already slashed
                return;
            }

            // Get base reward
            const baseReward = this.blockchain.getCurrentReward();

            // Distribute rewards proportionally
            const { validator: validatorReward, delegators } = stakingPool.distributeRewards(validatorAddress, baseReward);

            // Create reward transactions for delegators
            for (const [delegator, amount] of delegators) {
                if (amount >= 0.01) { // Minimum reward threshold
                    const rewardTx = new Transaction(null, delegator, amount, 0);
                    // Add to block (after creation, so it's included in next block)
                    this.blockchain.addTransaction(rewardTx);
                }
            }

            stakingPool.recordBlockCreated(validatorAddress);
            this.lastProducedSlot = currentSlot;

            // Save both blockchain and staking
            storage.saveBlockchain(this.blockchain.toJSON());
            storage.saveStaking(stakingPool.toJSON());

            const epochInfo = stakingPool.getEpochInfo();
            this.log.info(`📦 Slot ${currentSlot} | Block #${block.index} | Epoch ${epochInfo.epoch} | Validator: ${validatorAddress.slice(0, 12)}... | Delegator rewards: ${delegators.size}`);
        } catch (error) {
            this.log.error(`Block production failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    getStatus(): {
        running: boolean;
        validators: number;
        currentSlot: number;
        lastProducedSlot: number;
        epoch: number;
        epochProgress: number;
    } {
        const epochInfo = stakingPool.getEpochInfo();
        const latestBlock = this.blockchain.getLatestBlock();
        const blocksInEpoch = latestBlock.index - epochInfo.startBlock;
        const epochDuration = stakingPool.getEpochDuration();

        return {
            running: this.isRunning,
            validators: stakingPool.getValidators().length,
            currentSlot: vrfSelector.getCurrentSlot(),
            lastProducedSlot: this.lastProducedSlot,
            epoch: epochInfo.epoch,
            epochProgress: Math.min(100, Math.round((blocksInEpoch / epochDuration) * 100)),
        };
    }
}

let blockProducerInstance: BlockProducer | null = null;

export function initBlockProducer(blockchain: Blockchain): BlockProducer {
    if (!blockProducerInstance) {
        blockProducerInstance = new BlockProducer(blockchain);
    }
    return blockProducerInstance;
}

export function getBlockProducer(): BlockProducer | null {
    return blockProducerInstance;
}
