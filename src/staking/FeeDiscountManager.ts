/**
 * Fee Discount Manager
 * Provides fee discounts based on staking amount
 * 
 * Utility for LVE token: stake more → pay less fees
 * 
 * Discount tiers:
 * - 0-99 LVE staked: 0% discount
 * - 100-999 LVE: 10% discount  
 * - 1000-9999 LVE: 25% discount
 * - 10000+ LVE: 50% discount
 */

import { stakingPool } from '../staking/StakingPool.js';
import { logger } from '../utils/logger.js';

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
     */
    calculateDiscountedFee(address: string, baseFee: number): {
        originalFee: number;
        discountedFee: number;
        discountAmount: number;
        discountPercent: number;
        tier: string;
    } {
        const tier = this.getDiscountTier(address);
        const discountAmount = (baseFee * tier.discountPercent) / 100;
        const discountedFee = baseFee - discountAmount;

        return {
            originalFee: baseFee,
            discountedFee,
            discountAmount,
            discountPercent: tier.discountPercent,
            tier: tier.name,
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
