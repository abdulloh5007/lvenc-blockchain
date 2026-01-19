/**
 * BFT Finality Manager
 * Byzantine Fault Tolerant finality for PoS consensus
 * 
 * Implements a simplified PBFT-like finality mechanism:
 * - Blocks require 2/3 validator attestations to become finalized
 * - Once finalized, blocks cannot be reverted
 * - Provides economic finality through slashing
 */

import { logger } from '../utils/logger.js';
import { sha256 } from '../utils/crypto.js';
import { stakingPool } from '../staking/StakingPool.js';

const FINALITY_THRESHOLD = 2 / 3; // 2/3 of stake must attest
const ATTESTATION_WINDOW = 32; // Blocks to wait for attestations
const FINALITY_DEPTH = 2; // Epochs for ultimate finality

interface Attestation {
    blockHash: string;
    blockIndex: number;
    validator: string;
    signature: string;
    timestamp: number;
}

interface FinalityStatus {
    blockIndex: number;
    blockHash: string;
    attestationWeight: number;
    totalWeight: number;
    percentage: number;
    isFinalized: boolean;
    attestations: number;
    requiredWeight: number;
}

export class BFTFinalityManager {
    private attestations: Map<number, Map<string, Attestation>> = new Map(); // blockIndex -> validator -> attestation
    private finalizedBlocks: Set<number> = new Set();
    private lastFinalizedIndex: number = -1;
    private log = logger.child('BFTFinality');

    /**
     * Submit an attestation for a block
     */
    submitAttestation(attestation: Attestation): boolean {
        const { blockIndex, blockHash, validator, signature } = attestation;

        // Validate validator is active
        const validators = stakingPool.getValidators();
        const validatorInfo = validators.find(v => v.address === validator && v.isActive);

        if (!validatorInfo) {
            this.log.warn(`Attestation from non-active validator: ${validator.slice(0, 12)}...`);
            return false;
        }

        // Check if already finalized
        if (this.finalizedBlocks.has(blockIndex)) {
            this.log.debug(`Block ${blockIndex} already finalized`);
            return false;
        }

        // Store attestation
        if (!this.attestations.has(blockIndex)) {
            this.attestations.set(blockIndex, new Map());
        }

        const blockAttestations = this.attestations.get(blockIndex)!;

        // Check for conflicting attestation (slashable!)
        if (blockAttestations.has(validator)) {
            const existing = blockAttestations.get(validator)!;
            if (existing.blockHash !== blockHash) {
                this.log.error(`🔪 CONFLICTING attestation from ${validator.slice(0, 12)}...!`);
                // This should trigger slashing
                return false;
            }
            return true; // Duplicate attestation
        }

        blockAttestations.set(validator, attestation);
        this.log.debug(`Attestation received for block ${blockIndex} from ${validator.slice(0, 12)}...`);

        // Check if finality threshold reached
        this.checkFinality(blockIndex);

        return true;
    }

    /**
     * Check if block has reached finality
     */
    private checkFinality(blockIndex: number): void {
        const status = this.getFinalityStatus(blockIndex);

        if (status.isFinalized && !this.finalizedBlocks.has(blockIndex)) {
            this.finalizeBlock(blockIndex, status.blockHash);
        }
    }

    /**
     * Finalize a block
     */
    private finalizeBlock(blockIndex: number, blockHash: string): void {
        this.finalizedBlocks.add(blockIndex);

        if (blockIndex > this.lastFinalizedIndex) {
            this.lastFinalizedIndex = blockIndex;
        }

        this.log.info(`✅ Block ${blockIndex} FINALIZED with BFT consensus`);

        // Cleanup old attestations
        this.cleanupOldAttestations(blockIndex - ATTESTATION_WINDOW * 2);
    }

    /**
     * Get finality status for a block
     */
    getFinalityStatus(blockIndex: number): FinalityStatus {
        const validators = stakingPool.getValidators().filter(v => v.isActive);
        const blockAttestations = this.attestations.get(blockIndex);

        // Calculate total stake
        const totalWeight = validators.reduce((sum, v) => sum + v.stake + v.delegatedStake, 0);
        const requiredWeight = Math.floor(totalWeight * FINALITY_THRESHOLD);

        if (!blockAttestations || blockAttestations.size === 0) {
            return {
                blockIndex,
                blockHash: '',
                attestationWeight: 0,
                totalWeight,
                percentage: 0,
                isFinalized: this.finalizedBlocks.has(blockIndex),
                attestations: 0,
                requiredWeight,
            };
        }

        // Calculate attestation weight
        let attestationWeight = 0;
        let blockHash = '';

        for (const [validator, attestation] of blockAttestations) {
            const validatorInfo = validators.find(v => v.address === validator);
            if (validatorInfo) {
                attestationWeight += validatorInfo.stake + validatorInfo.delegatedStake;
                blockHash = attestation.blockHash;
            }
        }

        const percentage = totalWeight > 0 ? (attestationWeight / totalWeight) * 100 : 0;
        const isFinalized = attestationWeight >= requiredWeight || this.finalizedBlocks.has(blockIndex);

        return {
            blockIndex,
            blockHash,
            attestationWeight,
            totalWeight,
            percentage,
            isFinalized,
            attestations: blockAttestations.size,
            requiredWeight,
        };
    }

    /**
     * Check if a block is finalized
     */
    isFinalized(blockIndex: number): boolean {
        return this.finalizedBlocks.has(blockIndex);
    }

    /**
     * Get last finalized block index
     */
    getLastFinalizedIndex(): number {
        return this.lastFinalizedIndex;
    }

    /**
     * Create attestation for signing
     */
    createAttestation(blockIndex: number, blockHash: string, validator: string): Attestation {
        return {
            blockIndex,
            blockHash,
            validator,
            signature: '', // To be signed by validator
            timestamp: Date.now(),
        };
    }

    /**
     * Sign an attestation
     */
    signAttestation(attestation: Attestation, signFn: (data: string) => string): Attestation {
        const dataToSign = `${attestation.blockIndex}:${attestation.blockHash}:${attestation.validator}`;
        attestation.signature = signFn(dataToSign);
        return attestation;
    }

    /**
     * Cleanup old attestations
     */
    private cleanupOldAttestations(beforeIndex: number): void {
        for (const [blockIndex] of this.attestations) {
            if (blockIndex < beforeIndex) {
                this.attestations.delete(blockIndex);
            }
        }
    }

    /**
     * Get statistics
     */
    getStats(): { finalizedBlocks: number; pendingAttestations: number; lastFinalized: number } {
        return {
            finalizedBlocks: this.finalizedBlocks.size,
            pendingAttestations: this.attestations.size,
            lastFinalized: this.lastFinalizedIndex,
        };
    }
}

export const bftFinalityManager = new BFTFinalityManager();
