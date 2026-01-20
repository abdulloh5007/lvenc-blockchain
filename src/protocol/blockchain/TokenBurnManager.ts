/**
 * Token Burn Manager
 * Implements deflationary mechanics through fee burning
 * 
 * Burns a percentage of:
 * - Transaction fees
 * - AMM swap fees
 * - Staking penalties
 * 
 * SAFETY: Burn cap per epoch prevents extreme deflation
 */

import { logger } from '../utils/logger.js';

// Burn rates (percentages)
const TX_FEE_BURN_RATE = 50;      // 50% of tx fees burned
const SWAP_FEE_BURN_RATE = 30;    // 30% of swap fees burned  
const SLASH_BURN_RATE = 100;       // 100% of slashed tokens burned

// Safety limits
const MAX_BURN_PER_EPOCH_PERCENT = 1;  // Max 1% of total supply per epoch
const INITIAL_TOTAL_SUPPLY = 1_000_000_000; // 1 billion initial supply

interface BurnRecord {
    amount: number;
    reason: 'tx_fee' | 'swap_fee' | 'slash' | 'manual';
    txId?: string;
    blockIndex: number;
    timestamp: number;
}

interface BurnStats {
    totalBurned: number;
    txFeeBurned: number;
    swapFeeBurned: number;
    slashBurned: number;
    manualBurned: number;
    burnCount: number;
}

interface EpochBurnTracker {
    epoch: number;
    burnedThisEpoch: number;
    maxBurnThisEpoch: number;
}

export class TokenBurnManager {
    private totalBurned: number = 0;
    private burnHistory: BurnRecord[] = [];
    private stats: BurnStats = {
        totalBurned: 0,
        txFeeBurned: 0,
        swapFeeBurned: 0,
        slashBurned: 0,
        manualBurned: 0,
        burnCount: 0,
    };
    private epochTracker: EpochBurnTracker = {
        epoch: 0,
        burnedThisEpoch: 0,
        maxBurnThisEpoch: (INITIAL_TOTAL_SUPPLY * MAX_BURN_PER_EPOCH_PERCENT) / 100,
    };
    private log = logger.child('TokenBurn');

    /**
     * Update epoch and reset burn counter
     */
    updateEpoch(epoch: number, currentSupply?: number): void {
        if (epoch !== this.epochTracker.epoch) {
            this.log.info(`🔄 Epoch ${epoch}: Reset burn counter (was ${this.epochTracker.burnedThisEpoch.toFixed(2)} LVE)`);
            this.epochTracker.epoch = epoch;
            this.epochTracker.burnedThisEpoch = 0;
            // Recalculate max burn based on current supply
            const supply = currentSupply || (INITIAL_TOTAL_SUPPLY - this.totalBurned);
            this.epochTracker.maxBurnThisEpoch = (supply * MAX_BURN_PER_EPOCH_PERCENT) / 100;
        }
    }

    /**
     * Check if burn cap reached
     */
    private canBurn(amount: number): { allowed: boolean; cappedAmount: number } {
        const remaining = this.epochTracker.maxBurnThisEpoch - this.epochTracker.burnedThisEpoch;
        if (remaining <= 0) {
            this.log.warn(`⛔ Burn cap reached for epoch ${this.epochTracker.epoch}`);
            return { allowed: false, cappedAmount: 0 };
        }
        if (amount > remaining) {
            this.log.warn(`⚠️ Burn capped: ${amount.toFixed(4)} → ${remaining.toFixed(4)} LVE`);
            return { allowed: true, cappedAmount: remaining };
        }
        return { allowed: true, cappedAmount: amount };
    }

    /**
     * Calculate and record burn from transaction fee
     */
    burnFromTxFee(fee: number, txId: string, blockIndex: number): number {
        const burnAmount = (fee * TX_FEE_BURN_RATE) / 100;

        if (burnAmount > 0) {
            this.recordBurn(burnAmount, 'tx_fee', blockIndex, txId);
            this.stats.txFeeBurned += burnAmount;
        }

        return burnAmount;
    }

    /**
     * Calculate and record burn from AMM swap fee
     */
    burnFromSwapFee(fee: number, blockIndex: number): number {
        const burnAmount = (fee * SWAP_FEE_BURN_RATE) / 100;

        if (burnAmount > 0) {
            this.recordBurn(burnAmount, 'swap_fee', blockIndex);
            this.stats.swapFeeBurned += burnAmount;
        }

        return burnAmount;
    }

    /**
     * Burn slashed tokens (100%)
     */
    burnFromSlash(amount: number, blockIndex: number): number {
        const burnAmount = (amount * SLASH_BURN_RATE) / 100;

        if (burnAmount > 0) {
            this.recordBurn(burnAmount, 'slash', blockIndex);
            this.stats.slashBurned += burnAmount;
        }

        return burnAmount;
    }

    /**
     * Manual burn (e.g., from treasury)
     */
    manualBurn(amount: number, blockIndex: number): number {
        if (amount > 0) {
            this.recordBurn(amount, 'manual', blockIndex);
            this.stats.manualBurned += amount;
        }

        return amount;
    }

    /**
     * Record a burn event
     */
    private recordBurn(amount: number, reason: BurnRecord['reason'], blockIndex: number, txId?: string): void {
        const record: BurnRecord = {
            amount,
            reason,
            txId,
            blockIndex,
            timestamp: Date.now(),
        };

        this.burnHistory.push(record);
        this.totalBurned += amount;
        this.stats.totalBurned += amount;
        this.stats.burnCount++;

        // Keep only last 1000 records
        if (this.burnHistory.length > 1000) {
            this.burnHistory = this.burnHistory.slice(-1000);
        }

        this.log.info(`🔥 Burned ${amount.toFixed(4)} LVE (${reason}) | Total: ${this.totalBurned.toFixed(2)} LVE`);
    }

    /**
     * Get burn statistics
     */
    getStats(): BurnStats {
        return { ...this.stats };
    }

    /**
     * Get total burned
     */
    getTotalBurned(): number {
        return this.totalBurned;
    }

    /**
     * Get recent burns
     */
    getRecentBurns(count: number = 10): BurnRecord[] {
        return this.burnHistory.slice(-count);
    }

    /**
     * Calculate deflation rate (burned / total supply)
     */
    getDeflationRate(totalSupply: number): number {
        if (totalSupply <= 0) return 0;
        return (this.totalBurned / totalSupply) * 100;
    }

    /**
     * Export state for persistence
     */
    toJSON(): { stats: BurnStats; history: BurnRecord[] } {
        return {
            stats: this.stats,
            history: this.burnHistory,
        };
    }

    /**
     * Load state from persistence
     */
    loadFromData(data: { stats: BurnStats; history: BurnRecord[] }): void {
        if (data.stats) {
            this.stats = data.stats;
            this.totalBurned = data.stats.totalBurned;
        }
        if (data.history) {
            this.burnHistory = data.history;
        }
        this.log.info(`📂 Loaded burn data: ${this.totalBurned.toFixed(2)} LVE total burned`);
    }
}

export const tokenBurnManager = new TokenBurnManager();

// Burn rate constants for external use
export const BURN_RATES = {
    TX_FEE: TX_FEE_BURN_RATE,
    SWAP_FEE: SWAP_FEE_BURN_RATE,
    SLASH: SLASH_BURN_RATE,
};
