/**
 * Price Display Service
 * Converts on-chain USDT prices to display currencies (UZS, etc.)
 * 
 * RULES:
 * - On-chain: LVE/USDT only (no fiat)
 * - Display: UZS (or other local currencies)
 * - USDT/UZS rate from oracle or config
 */

import { logger } from '../../protocol/utils/logger.js';

const log = logger.child('PriceDisplay');

// Default USDT/UZS rate (can be updated from oracle)
let USDT_TO_UZS_RATE = 12_500; // 1 USDT = 12,500 UZS (example rate)

interface PriceInCurrency {
    lve: number;
    usdt: number;
    uzs: number;
}

export class PriceDisplayService {
    private usdtToUzsRate: number = USDT_TO_UZS_RATE;
    private lastRateUpdate: number = Date.now();

    /**
     * Update USDT/UZS rate (from oracle or manual config)
     */
    updateUsdtUzsRate(rate: number): void {
        if (rate <= 0) {
            throw new Error('Rate must be positive');
        }
        this.usdtToUzsRate = rate;
        this.lastRateUpdate = Date.now();
        log.info(`💱 USDT/UZS rate updated: 1 USDT = ${rate.toLocaleString()} UZS`);
    }

    /**
     * Get current USDT/UZS rate
     */
    getUsdtUzsRate(): number {
        return this.usdtToUzsRate;
    }

    /**
     * Convert LVE/USDT price to display currencies
     */
    convertPrice(lveUsdtPrice: number): PriceInCurrency {
        return {
            lve: 1,
            usdt: lveUsdtPrice,
            uzs: lveUsdtPrice * this.usdtToUzsRate,
        };
    }

    /**
     * Convert USDT amount to UZS display
     */
    usdtToUzs(usdtAmount: number): number {
        return usdtAmount * this.usdtToUzsRate;
    }

    /**
     * Convert UZS display to USDT (for reference only)
     */
    uzsToUsdt(uzsAmount: number): number {
        return uzsAmount / this.usdtToUzsRate;
    }

    /**
     * Format price for display
     */
    formatPrice(lveUsdtPrice: number): {
        onchain: string;
        display: string;
    } {
        const prices = this.convertPrice(lveUsdtPrice);
        return {
            onchain: `${prices.usdt.toFixed(6)} USDT`,
            display: `${prices.uzs.toLocaleString()} UZS`,
        };
    }

    /**
     * Get service info
     */
    getInfo(): {
        usdtToUzsRate: number;
        lastUpdate: number;
        example: { lve: number; usdt: number; uzs: number };
    } {
        return {
            usdtToUzsRate: this.usdtToUzsRate,
            lastUpdate: this.lastRateUpdate,
            example: this.convertPrice(0.05), // Example: 1 LVE = 0.05 USDT
        };
    }
}

export const priceDisplayService = new PriceDisplayService();

// Export default rate
export { USDT_TO_UZS_RATE };
