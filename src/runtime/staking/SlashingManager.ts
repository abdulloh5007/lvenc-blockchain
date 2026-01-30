/**
 * SlashingManager - Handles validator penalties
 * 
 * Based on Cosmos SDK x/slashing module:
 * - Double-sign detection (immediate slash)
 * - Liveness tracking (sliding window)
 * - Downtime penalties (slash + jail)
 */

import { stakingPool } from './StakingPool.js';
import { logger } from '../../protocol/utils/logger.js';
import { chainParams } from '../../protocol/params/index.js';

// Parameters from chain config
const SIGNED_BLOCKS_WINDOW = chainParams.staking.signedBlocksWindow;
const MIN_SIGNED_PER_WINDOW = chainParams.staking.minSignedPerWindow;
const DOWNTIME_SLASH_PERCENT = chainParams.staking.downtimeSlashPercent;
const DOUBLE_SIGN_SLASH_PERCENT = chainParams.staking.slashPercent;

interface SlashingEvidence {
    validator: string;
    type: 'double-sign' | 'downtime';
    slot: number;
    timestamp: number;
    penalty: number;
    details: string;
}

interface ValidatorSigningInfo {
    address: string;
    startSlot: number;           // First slot tracked
    indexOffset: number;         // Current position in sliding window
    missedBlocksCounter: number; // Total missed in current window
    missedBlocksBitArray: boolean[]; // Bitmap of missed slots
    jailedUntilSlot: number;     // 0 if not jailed
}

export class SlashingManager {
    private evidence: SlashingEvidence[] = [];
    private blockSignatures: Map<number, Map<string, string>> = new Map();
    private signingInfo: Map<string, ValidatorSigningInfo> = new Map();
    private expectedValidators: Map<number, string> = new Map(); // slot -> expected validator
    private log = logger.child('Slashing');

    /**
     * Record which validator was expected to produce a block for this slot
     */
    recordExpectedValidator(slot: number, validator: string): void {
        this.expectedValidators.set(slot, validator);
        // Cleanup old entries
        if (this.expectedValidators.size > SIGNED_BLOCKS_WINDOW * 2) {
            const oldSlot = slot - SIGNED_BLOCKS_WINDOW * 2;
            this.expectedValidators.delete(oldSlot);
        }
    }

    /**
     * Record that a block was signed by validator (they produced the block)
     */
    recordBlockSigned(slot: number, validator: string, signature: string): boolean {
        // Check for double-sign
        if (!this.blockSignatures.has(slot)) {
            this.blockSignatures.set(slot, new Map());
        }
        const slotSigs = this.blockSignatures.get(slot)!;
        const existingSig = slotSigs.get(validator);

        if (existingSig && existingSig !== signature) {
            // DOUBLE SIGN DETECTED!
            this.slashDoubleSign(validator, slot, existingSig, signature);
            return false;
        }

        slotSigs.set(validator, signature);

        // Update liveness tracking - validator signed successfully
        this.updateSigningInfo(validator, slot, false);

        return true;
    }

    /**
     * Called when a slot passed without the expected validator producing a block
     */
    recordMissedSlot(slot: number, expectedValidator: string): void {
        // Update liveness tracking - validator missed
        this.updateSigningInfo(expectedValidator, slot, true);

        this.log.debug(`📉 Validator ${expectedValidator.slice(0, 12)}... missed slot ${slot}`);
    }

    /**
     * Check and process a slot after timeout
     * Called by BlockProducer when moving to next slot
     */
    checkSlotTimeout(previousSlot: number, blockWasReceived: boolean): void {
        const expectedValidator = this.expectedValidators.get(previousSlot);
        if (!expectedValidator) return;

        if (!blockWasReceived) {
            // Previous slot had no block - expected validator missed it
            this.recordMissedSlot(previousSlot, expectedValidator);
        }
    }

    /**
     * Update signing info for a validator (Cosmos-style sliding window)
     */
    private updateSigningInfo(validator: string, slot: number, missed: boolean): void {
        let info = this.signingInfo.get(validator);

        if (!info) {
            // First time seeing this validator
            info = {
                address: validator,
                startSlot: slot,
                indexOffset: 0,
                missedBlocksCounter: 0,
                missedBlocksBitArray: new Array(SIGNED_BLOCKS_WINDOW).fill(false),
                jailedUntilSlot: 0,
            };
            this.signingInfo.set(validator, info);
        }

        // Calculate index in circular buffer
        const index = info.indexOffset % SIGNED_BLOCKS_WINDOW;

        // Get previous value at this index
        const missedPrevious = info.missedBlocksBitArray[index];

        // Update the bit array and counter
        if (!missedPrevious && missed) {
            // Changed from not-missed to missed: increment counter
            info.missedBlocksBitArray[index] = true;
            info.missedBlocksCounter++;
        } else if (missedPrevious && !missed) {
            // Changed from missed to not-missed: decrement counter
            info.missedBlocksBitArray[index] = false;
            info.missedBlocksCounter--;
        }
        // If no change, counter stays same

        info.indexOffset++;

        // Check if validator should be jailed for downtime
        // Only check after we have a full window of data
        const slotsTracked = info.indexOffset;
        if (slotsTracked >= SIGNED_BLOCKS_WINDOW) {
            const maxMissed = Math.floor(SIGNED_BLOCKS_WINDOW * (1 - MIN_SIGNED_PER_WINDOW));

            if (info.missedBlocksCounter > maxMissed) {
                this.slashDowntime(validator, info.missedBlocksCounter);

                // Reset counter after jailing (don't immediately re-slash)
                info.missedBlocksCounter = 0;
                info.missedBlocksBitArray = new Array(SIGNED_BLOCKS_WINDOW).fill(false);
                info.indexOffset = 0;
            }
        }
    }

    /**
     * Slash validator for double-signing (serious offense)
     */
    private slashDoubleSign(validator: string, slot: number, sig1: string, sig2: string): void {
        const stake = stakingPool.getStake(validator);
        const penalty = Math.floor(stake * DOUBLE_SIGN_SLASH_PERCENT / 100);

        stakingPool.slash(validator, `Double-sign at slot ${slot}`);

        const evidence: SlashingEvidence = {
            validator,
            type: 'double-sign',
            slot,
            timestamp: Date.now(),
            penalty,
            details: `Signatures: ${sig1.slice(0, 16)}... / ${sig2.slice(0, 16)}...`,
        };
        this.evidence.push(evidence);

        this.log.warn(`🔪 DOUBLE-SIGN SLASH: ${validator.slice(0, 12)}... at slot ${slot}. Penalty: ${penalty} LVE`);
    }

    /**
     * Slash validator for downtime (missed too many blocks)
     */
    private slashDowntime(validator: string, missedCount: number): void {
        const stake = stakingPool.getStake(validator);
        const penalty = Math.floor(stake * DOWNTIME_SLASH_PERCENT / 100);

        // Use reduced slash for downtime
        stakingPool.slashForDowntime(validator, `Missed ${missedCount}/${SIGNED_BLOCKS_WINDOW} slots`);

        const evidence: SlashingEvidence = {
            validator,
            type: 'downtime',
            slot: -1,
            timestamp: Date.now(),
            penalty,
            details: `Missed ${missedCount} of last ${SIGNED_BLOCKS_WINDOW} slots`,
        };
        this.evidence.push(evidence);

        this.log.warn(`⏰ DOWNTIME SLASH: ${validator.slice(0, 12)}... missed ${missedCount}/${SIGNED_BLOCKS_WINDOW} slots. Penalty: ${penalty} LVE`);
    }

    /**
     * Get validator's current liveness status
     */
    getValidatorLiveness(validator: string): {
        missedBlocks: number;
        windowSize: number;
        signRate: number;
        isAtRisk: boolean;
    } | null {
        const info = this.signingInfo.get(validator);
        if (!info) return null;

        const maxMissed = Math.floor(SIGNED_BLOCKS_WINDOW * (1 - MIN_SIGNED_PER_WINDOW));
        const signRate = 1 - (info.missedBlocksCounter / SIGNED_BLOCKS_WINDOW);

        return {
            missedBlocks: info.missedBlocksCounter,
            windowSize: SIGNED_BLOCKS_WINDOW,
            signRate,
            isAtRisk: info.missedBlocksCounter > maxMissed * 0.8, // Warning at 80% of max
        };
    }

    /**
     * Get all slashing evidence
     */
    getEvidence(): SlashingEvidence[] {
        return [...this.evidence];
    }

    getRecentEvidence(count: number = 10): SlashingEvidence[] {
        return this.evidence.slice(-count);
    }

    /**
     * Cleanup old data to prevent memory growth
     */
    cleanupOldData(currentSlot: number, maxAge: number = 1000): void {
        const minSlot = currentSlot - maxAge;
        for (const [slot] of this.blockSignatures) {
            if (slot < minSlot) {
                this.blockSignatures.delete(slot);
            }
        }
        for (const [slot] of this.expectedValidators) {
            if (slot < minSlot) {
                this.expectedValidators.delete(slot);
            }
        }
    }
}

export const slashingManager = new SlashingManager();
