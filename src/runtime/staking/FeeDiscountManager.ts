/**
 * Fee Discount Manager
 * Provides fee discounts based on staking amount
 * 
 * TWO MODES:
 * 1. Tier-based: fixed tiers (Bronze/Silver/Gold/Diamond)
 * 2. Dynamic: logarithmic scale (smooth progression)
 * 
 * Dynamic formula: discount = min(50, log10(stake) * 10)
 * - 10 LVE = 10% discount
 * - 100 LVE = 20% discount
 * - 1000 LVE = 30% discount
 * - 10000 LVE = 40% discount
 * - 100000 LVE = 50% discount (max)
 */

import { stakingPool } from '../staking/StakingPool.js';
import { logger } from '../../protocol/utils/logger.js';

const USE_DYNAMIC_DISCOUNT = true;   // Use log-based instead of tiers
const MAX_DISCOUNT_PERCENT = 50;     // Maximum discount cap
const MIN_STAKE_FOR_DISCOUNT = 10;   // Minimum stake to get any discount

interface DiscountTier {
    minStake: number;
    discountPercent: number;
    name: string;
}

const DISCOUNT_TIERS: DiscountTier[] = [
    { minStake: 10000, discountPercent: 50, name: 'Diamond' },
    { minStake: 1000, discountPercent: 25, name: 'Gold' },
    { minStake: 100, discountPercent: 10, name: 'Silver' },
    { minStake: 0, discountPercent: 0, name: 'Bronze' },
];

export class FeeDiscountManager {
    private log = logger.child('FeeDiscount');

    /**
     * Calculate dynamic discount using logarithmic scale
     * Provides smooth progression: discount = log10(stake) * 10, max 50%
     */
    calculateDynamicDiscount(stake: number): number {
        if (stake < MIN_STAKE_FOR_DISCOUNT) return 0;

        // log10(10) = 1 → 10%, log10(100) = 2 → 20%, etc.
        const discount = Math.log10(stake) * 10;
        return Math.min(MAX_DISCOUNT_PERCENT, Math.max(0, discount));
    }

    /**
     * Get discount tier for an address based on staking amount
     */
    getDiscountTier(address: string): DiscountTier {
        const stake = stakingPool.getStake(address);

        for (const tier of DISCOUNT_TIERS) {
            if (stake >= tier.minStake) {
                return tier;
            }
        }

        return DISCOUNT_TIERS[DISCOUNT_TIERS.length - 1];
    }

    /**
     * Calculate discounted fee for an address
     * Uses dynamic or tier-based discount depending on config
     */
    calculateDiscountedFee(address: string, baseFee: number): {
        originalFee: number;
        discountedFee: number;
        discountAmount: number;
        discountPercent: number;
        tier: string;
        mode: 'dynamic' | 'tier';
    } {
        const stake = stakingPool.getStake(address);
        let discountPercent: number;
        let tier: string;

        if (USE_DYNAMIC_DISCOUNT) {
            discountPercent = this.calculateDynamicDiscount(stake);
            tier = `Dynamic (${stake.toFixed(0)} LVE)`;
        } else {
            const tierInfo = this.getDiscountTier(address);
            discountPercent = tierInfo.discountPercent;
            tier = tierInfo.name;
        }

        const discountAmount = (baseFee * discountPercent) / 100;
        const discountedFee = baseFee - discountAmount;

        return {
            originalFee: baseFee,
            discountedFee,
            discountAmount,
            discountPercent,
            tier,
            mode: USE_DYNAMIC_DISCOUNT ? 'dynamic' : 'tier',
        };
    }

    /**
     * Get all tiers info (for UI display)
     */
    getTiers(): DiscountTier[] {
        return [...DISCOUNT_TIERS];
    }

    /**
     * Get staking requirement for next tier
     */
    getNextTierRequirement(address: string): {
        currentTier: string;
        nextTier: string | null;
        stakeNeeded: number;
        currentStake: number;
    } {
        const stake = stakingPool.getStake(address);
        const currentTier = this.getDiscountTier(address);

        // Find next tier
        const currentIndex = DISCOUNT_TIERS.findIndex(t => t.name === currentTier.name);
        const nextTier = currentIndex > 0 ? DISCOUNT_TIERS[currentIndex - 1] : null;

        return {
            currentTier: currentTier.name,
            nextTier: nextTier?.name || null,
            stakeNeeded: nextTier ? nextTier.minStake - stake : 0,
            currentStake: stake,
        };
    }

    /**
     * Check if address qualifies for any discount
     */
    hasDiscount(address: string): boolean {
        return this.getDiscountTier(address).discountPercent > 0;
    }
}

export const feeDiscountManager = new FeeDiscountManager();

// Export tiers for external use
export { DISCOUNT_TIERS };
