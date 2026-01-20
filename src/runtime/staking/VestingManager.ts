/**
 * Vesting Manager
 * Manages token vesting schedules for team and advisors
 * 
 * VESTING RULES:
 * - Linear vesting over 36-48 months
 * - No early access (cliff period)
 * - Tokens unlock gradually per block
 * - Unclaimed tokens remain locked
 */

import { logger } from '../../protocol/utils/logger.js';
import { sha256 } from '../../protocol/utils/crypto.js';

// Vesting parameters
const BLOCKS_PER_MONTH = 86400;  // ~30 days at 30s blocks
const DEFAULT_CLIFF_MONTHS = 6;   // 6 month cliff
const DEFAULT_VESTING_MONTHS = 36; // 36 months total

type VestingStatus = 'pending' | 'active' | 'completed' | 'revoked';

interface VestingSchedule {
    id: string;
    beneficiary: string;
    totalAmount: number;
    claimedAmount: number;
    startBlock: number;
    cliffBlock: number;
    endBlock: number;
    vestingMonths: number;
    cliffMonths: number;
    status: VestingStatus;
    createdAt: number;
    lastClaimBlock: number;
}

interface VestingClaim {
    scheduleId: string;
    amount: number;
    blockIndex: number;
    timestamp: number;
}

export class VestingManager {
    private schedules: Map<string, VestingSchedule> = new Map();
    private claims: VestingClaim[] = [];
    private log = logger.child('Vesting');

    /**
     * Create a new vesting schedule
     */
    createSchedule(
        beneficiary: string,
        totalAmount: number,
        startBlock: number,
        vestingMonths: number = DEFAULT_VESTING_MONTHS,
        cliffMonths: number = DEFAULT_CLIFF_MONTHS
    ): VestingSchedule {
        if (totalAmount <= 0) {
            throw new Error('Vesting amount must be positive');
        }
        if (vestingMonths < 12 || vestingMonths > 60) {
            throw new Error('Vesting period must be 12-60 months');
        }
        if (cliffMonths >= vestingMonths) {
            throw new Error('Cliff must be less than vesting period');
        }

        const id = sha256(beneficiary + totalAmount.toString() + startBlock.toString()).slice(0, 16);

        const schedule: VestingSchedule = {
            id,
            beneficiary,
            totalAmount,
            claimedAmount: 0,
            startBlock,
            cliffBlock: startBlock + (cliffMonths * BLOCKS_PER_MONTH),
            endBlock: startBlock + (vestingMonths * BLOCKS_PER_MONTH),
            vestingMonths,
            cliffMonths,
            status: 'pending',
            createdAt: Date.now(),
            lastClaimBlock: startBlock,
        };

        this.schedules.set(id, schedule);
        this.log.info(`📋 Vesting created: ${totalAmount.toLocaleString()} LVE for ${beneficiary.slice(0, 12)}... over ${vestingMonths} months`);

        return schedule;
    }

    /**
     * Calculate vested amount at a given block
     */
    getVestedAmount(scheduleId: string, currentBlock: number): number {
        const schedule = this.schedules.get(scheduleId);
        if (!schedule) return 0;

        // Before cliff: nothing vested
        if (currentBlock < schedule.cliffBlock) {
            return 0;
        }

        // After end: everything vested
        if (currentBlock >= schedule.endBlock) {
            return schedule.totalAmount;
        }

        // Linear vesting between cliff and end
        const vestingStart = schedule.cliffBlock;
        const vestingDuration = schedule.endBlock - vestingStart;
        const elapsed = currentBlock - vestingStart;

        const vestedAmount = (schedule.totalAmount * elapsed) / vestingDuration;
        return Math.floor(vestedAmount);
    }

    /**
     * Get claimable amount (vested - already claimed)
     */
    getClaimableAmount(scheduleId: string, currentBlock: number): number {
        const schedule = this.schedules.get(scheduleId);
        if (!schedule) return 0;

        const vested = this.getVestedAmount(scheduleId, currentBlock);
        return Math.max(0, vested - schedule.claimedAmount);
    }

    /**
     * Claim vested tokens
     */
    claim(scheduleId: string, currentBlock: number): { amount: number; remaining: number } {
        const schedule = this.schedules.get(scheduleId);
        if (!schedule) {
            throw new Error('Schedule not found');
        }

        if (schedule.status === 'revoked') {
            throw new Error('Schedule has been revoked');
        }

        const claimable = this.getClaimableAmount(scheduleId, currentBlock);
        if (claimable <= 0) {
            throw new Error('Nothing to claim');
        }

        // Update schedule
        schedule.claimedAmount += claimable;
        schedule.lastClaimBlock = currentBlock;
        schedule.status = schedule.claimedAmount >= schedule.totalAmount ? 'completed' : 'active';

        // Record claim
        this.claims.push({
            scheduleId,
            amount: claimable,
            blockIndex: currentBlock,
            timestamp: Date.now(),
        });

        const remaining = schedule.totalAmount - schedule.claimedAmount;
        this.log.info(`💸 Claimed ${claimable.toLocaleString()} LVE from ${scheduleId.slice(0, 8)}... | Remaining: ${remaining.toLocaleString()}`);

        return { amount: claimable, remaining };
    }

    /**
     * Revoke a vesting schedule (emergency only)
     * Unclaimed tokens are returned to treasury
     */
    revoke(scheduleId: string): { returnedAmount: number } {
        const schedule = this.schedules.get(scheduleId);
        if (!schedule) {
            throw new Error('Schedule not found');
        }

        if (schedule.status === 'completed' || schedule.status === 'revoked') {
            throw new Error(`Cannot revoke: schedule is ${schedule.status}`);
        }

        const returnedAmount = schedule.totalAmount - schedule.claimedAmount;
        schedule.status = 'revoked';

        this.log.warn(`❌ Vesting revoked: ${returnedAmount.toLocaleString()} LVE returned to treasury`);
        return { returnedAmount };
    }

    /**
     * Get all schedules for a beneficiary
     */
    getSchedulesForBeneficiary(beneficiary: string): VestingSchedule[] {
        return Array.from(this.schedules.values()).filter(s => s.beneficiary === beneficiary);
    }

    /**
     * Get schedule by ID
     */
    getSchedule(id: string): VestingSchedule | undefined {
        return this.schedules.get(id);
    }

    /**
     * Get all active schedules
     */
    getActiveSchedules(): VestingSchedule[] {
        return Array.from(this.schedules.values()).filter(
            s => s.status === 'pending' || s.status === 'active'
        );
    }

    /**
     * Get vesting summary
     */
    getSummary(): {
        totalSchedules: number;
        activeSchedules: number;
        totalVesting: number;
        totalClaimed: number;
        totalRemaining: number;
    } {
        let totalVesting = 0;
        let totalClaimed = 0;
        let active = 0;

        for (const schedule of this.schedules.values()) {
            totalVesting += schedule.totalAmount;
            totalClaimed += schedule.claimedAmount;
            if (schedule.status === 'pending' || schedule.status === 'active') {
                active++;
            }
        }

        return {
            totalSchedules: this.schedules.size,
            activeSchedules: active,
            totalVesting,
            totalClaimed,
            totalRemaining: totalVesting - totalClaimed,
        };
    }

    /**
     * Export for persistence
     */
    toJSON(): object {
        return {
            schedules: Object.fromEntries(this.schedules),
            claims: this.claims.slice(-100),
        };
    }

    /**
     * Load from persistence
     */
    loadFromData(data: any): void {
        if (data.schedules) {
            for (const [id, schedule] of Object.entries(data.schedules)) {
                this.schedules.set(id, schedule as VestingSchedule);
            }
        }
        if (data.claims) this.claims = data.claims;
        this.log.info(`📂 Loaded ${this.schedules.size} vesting schedules`);
    }
}

export const vestingManager = new VestingManager();

// Export constants
export { BLOCKS_PER_MONTH, DEFAULT_CLIFF_MONTHS, DEFAULT_VESTING_MONTHS };
