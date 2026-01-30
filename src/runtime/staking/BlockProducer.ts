import { Blockchain, Transaction } from '../../protocol/blockchain/index.js';
import { stakingPool } from './StakingPool.js';
import { vrfSelector } from './VRFSelector.js';
import { slashingManager } from './SlashingManager.js';
import { storage } from '../../protocol/storage/index.js';
import { logger } from '../../protocol/utils/logger.js';
import { sha256 } from '../../protocol/utils/crypto.js';
import { chainParams } from '../../protocol/params/index.js';
import { getUnifiedIdentity } from '../../node/identity/index.js';
import { createSigningData } from '../../protocol/blockchain/BlockSignature.js';

const SLOT_DURATION = 30000;

export class BlockProducer {
    private blockchain: Blockchain;
    private intervalId: NodeJS.Timeout | null = null;
    private isRunning = false;
    private lastProducedSlot = -1;
    private lastProcessedSlot = -1;  // Track which slot we last checked
    private receivedBlocksForSlot: Map<number, boolean> = new Map();  // slot -> block received
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
        this.log.info(`● Block producer started (slot duration: ${SLOT_DURATION / 1000}s)`);
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

        // Check if previous slot was missed (liveness tracking)
        if (this.lastProcessedSlot >= 0 && currentSlot > this.lastProcessedSlot) {
            for (let slot = this.lastProcessedSlot; slot < currentSlot; slot++) {
                const blockReceived = this.receivedBlocksForSlot.get(slot) || false;
                slashingManager.checkSlotTimeout(slot, blockReceived);
            }
            // Cleanup old entries
            for (const [slot] of this.receivedBlocksForSlot) {
                if (slot < currentSlot - 100) {
                    this.receivedBlocksForSlot.delete(slot);
                }
            }
        }
        this.lastProcessedSlot = currentSlot;

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

            this.log.info(`🔄 Epoch transition completed at block ${currentBlockIndex}`);
        }

        const seed = vrfSelector.generateSeed(latestBlock.hash, currentSlot);

        // Apply stake penalty for outdated protocol version
        // Validators running outdated nodes have reduced weight in selection
        const graceUntilBlock = chainParams.version.graceUntilBlock;
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

        // Record expected validator for liveness tracking
        slashingManager.recordExpectedValidator(currentSlot, validatorAddress);

        // Get our unified identity (if initialized)
        const identity = getUnifiedIdentity();

        // Check if THIS node is the selected validator
        if (!identity) {
            // No identity - we're not a validator node
            this.log.debug(`Slot ${currentSlot}: No identity, skipping block production`);
            return;
        }

        const myValidatorAddress = identity.getFullAddress();
        if (validatorAddress !== myValidatorAddress) {
            // Not our slot - another validator should produce this block
            this.log.debug(`Slot ${currentSlot}: Not our turn (selected: ${validatorAddress.slice(0, 12)}...)`);
            return;
        }

        // IT'S OUR SLOT! Produce the block
        this.log.info(`🎯 Slot ${currentSlot}: Our turn to produce block`);

        try {
            const signFn = (hash: string): string => {
                // Create domain-separated signing data: chainId:blockIndex:blockHash
                const signingData = createSigningData(latestBlock.index + 1, hash);
                return identity.sign(signingData);
            };
            const block = this.blockchain.createPoSBlock(validatorAddress, signFn);
            (block as { slotNumber?: number }).slotNumber = currentSlot;

            // Record block signature for double-sign detection and liveness tracking
            const blockSignature = sha256(block.hash + validatorAddress + currentSlot.toString());
            const isValidSignature = slashingManager.recordBlockSigned(currentSlot, validatorAddress, blockSignature);

            if (!isValidSignature) {
                this.log.error(`🔪 Double-sign detected for validator ${validatorAddress.slice(0, 12)}... at slot ${currentSlot}!`);
                // Block is rejected, validator already slashed
                return;
            }

            // Mark that we produced a block for this slot
            this.receivedBlocksForSlot.set(currentSlot, true);

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

    /**
     * Called by Blockchain when a block is received from a peer
     * Used for liveness tracking - mark that this slot had a block produced
     */
    markBlockReceived(slot: number, validator: string, signature: string): void {
        this.receivedBlocksForSlot.set(slot, true);
        // Also record in slashing manager for double-sign detection
        slashingManager.recordBlockSigned(slot, validator, signature);
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
