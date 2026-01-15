import { createHash } from 'crypto';
import { logger } from '../utils/logger.js';
const SLOT_DURATION = 30000;
export class VRFSelector {
    private log = logger.child('VRF');
    generateSeed(previousBlockHash: string, slotNumber: number): string {
        const data = `${previousBlockHash}:${slotNumber}`;
        return createHash('sha256').update(data).digest('hex');
    }
    selectValidator(validators: { address: string; stake: number }[], seed: string): string | null {
        if (validators.length === 0) return null;
        const totalStake = validators.reduce((sum, v) => sum + v.stake, 0);
        if (totalStake === 0) return null;
        const seedNum = parseInt(seed.slice(0, 16), 16);
        const target = seedNum % totalStake;
        let cumulative = 0;
        for (const validator of validators) {
            cumulative += validator.stake;
            if (target < cumulative) {
                this.log.debug(`VRF selected ${validator.address.slice(0, 10)}... (stake=${validator.stake}, seed=${seed.slice(0, 8)})`);
                return validator.address;
            }
        }
        return validators[validators.length - 1].address;
    }
    getCurrentSlot(): number {
        return Math.floor(Date.now() / SLOT_DURATION);
    }
    getSlotStartTime(slotNumber: number): number {
        return slotNumber * SLOT_DURATION;
    }
    getTimeUntilNextSlot(): number {
        const now = Date.now();
        const currentSlotStart = Math.floor(now / SLOT_DURATION) * SLOT_DURATION;
        return currentSlotStart + SLOT_DURATION - now;
    }
}
export const vrfSelector = new VRFSelector();
