import { stakingPool } from './StakingPool.js';
import { logger } from '../utils/logger.js';
const DOUBLE_SIGN_SLASH_PERCENT = 50;
const OFFLINE_SLASH_PERCENT = 0.1;
const MAX_MISSED_SLOTS = 100;
interface SlashingEvidence {
    validator: string;
    type: 'double-sign' | 'offline';
    slot: number;
    timestamp: number;
    penalty: number;
    details: string;
}
interface ValidatorMissedSlots {
    address: string;
    missedCount: number;
    lastSeenSlot: number;
}
export class SlashingManager {
    private evidence: SlashingEvidence[] = [];
    private blockSignatures: Map<number, Map<string, string>> = new Map();
    private missedSlots: Map<string, ValidatorMissedSlots> = new Map();
    private log = logger.child('Slashing');
    recordBlockSignature(slot: number, validator: string, signature: string): boolean {
        if (!this.blockSignatures.has(slot)) {
            this.blockSignatures.set(slot, new Map());
        }
        const slotSigs = this.blockSignatures.get(slot)!;
        const existingSig = slotSigs.get(validator);
        if (existingSig && existingSig !== signature) {
            this.slashDoubleSign(validator, slot, existingSig, signature);
            return false;
        }
        slotSigs.set(validator, signature);
        this.updateValidatorActivity(validator, slot);
        return true;
    }
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
        this.log.warn(`🔪 SLASHED ${validator.slice(0, 12)}... for double-sign at slot ${slot}. Penalty: ${penalty} LVE`);
    }
    recordMissedSlot(slot: number, expectedValidator: string): void {
        let record = this.missedSlots.get(expectedValidator);
        if (!record) {
            record = { address: expectedValidator, missedCount: 0, lastSeenSlot: slot - 1 };
            this.missedSlots.set(expectedValidator, record);
        }
        record.missedCount++;
        if (record.missedCount >= MAX_MISSED_SLOTS) {
            this.slashOffline(expectedValidator, record.missedCount);
            record.missedCount = 0;
        }
    }
    private slashOffline(validator: string, missedCount: number): void {
        const stake = stakingPool.getStake(validator);
        const penalty = Math.floor(stake * OFFLINE_SLASH_PERCENT * missedCount / 100);
        stakingPool.slash(validator, `Offline for ${missedCount} slots`);
        const evidence: SlashingEvidence = {
            validator,
            type: 'offline',
            slot: -1,
            timestamp: Date.now(),
            penalty,
            details: `Missed ${missedCount} consecutive slots`,
        };
        this.evidence.push(evidence);
        this.log.warn(`🔪 SLASHED ${validator.slice(0, 12)}... for being offline. Penalty: ${penalty} LVE`);
    }
    private updateValidatorActivity(validator: string, slot: number): void {
        const record = this.missedSlots.get(validator);
        if (record) {
            record.missedCount = 0;
            record.lastSeenSlot = slot;
        }
    }
    getEvidence(): SlashingEvidence[] {
        return [...this.evidence];
    }
    getRecentEvidence(count: number = 10): SlashingEvidence[] {
        return this.evidence.slice(-count);
    }
    cleanupOldData(currentSlot: number, maxAge: number = 1000): void {
        const minSlot = currentSlot - maxAge;
        for (const [slot] of this.blockSignatures) {
            if (slot < minSlot) {
                this.blockSignatures.delete(slot);
            }
        }
    }
}
export const slashingManager = new SlashingManager();
