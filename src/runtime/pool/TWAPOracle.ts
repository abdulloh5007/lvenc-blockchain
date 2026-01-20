/**
 * TWAP Oracle
 * Time-Weighted Average Price oracle for AMM
 * 
 * Provides manipulation-resistant price feeds by averaging
 * prices over time, making flash loan attacks impractical
 */

import { logger } from '../../protocol/utils/logger.js';

const DEFAULT_TWAP_WINDOW = 30 * 60 * 1000; // 30 minutes
const MAX_OBSERVATIONS = 1000;
const MIN_OBSERVATIONS = 3;

interface PriceObservation {
    timestamp: number;
    priceLVEtoUZS: number;
    priceUZStoLVE: number;
    reserveLVE: bigint;
    reserveUZS: bigint;
    cumulativePrice: number;
}

export class TWAPOracle {
    private observations: PriceObservation[] = [];
    private log = logger.child('TWAPOracle');

    /**
     * Record a new price observation
     * Should be called after each swap or liquidity change
     */
    recordObservation(
        reserveLVE: bigint,
        reserveUZS: bigint
    ): void {
        const timestamp = Date.now();

        // Calculate current prices
        const priceLVEtoUZS = Number(reserveUZS) / Number(reserveLVE);
        const priceUZStoLVE = Number(reserveLVE) / Number(reserveUZS);

        // Calculate cumulative price (for TWAP calculation)
        const lastObs = this.observations[this.observations.length - 1];
        const timeDelta = lastObs ? timestamp - lastObs.timestamp : 0;
        const cumulativePrice = lastObs
            ? lastObs.cumulativePrice + priceLVEtoUZS * timeDelta
            : 0;

        const observation: PriceObservation = {
            timestamp,
            priceLVEtoUZS,
            priceUZStoLVE,
            reserveLVE,
            reserveUZS,
            cumulativePrice,
        };

        this.observations.push(observation);

        // Cleanup old observations
        if (this.observations.length > MAX_OBSERVATIONS) {
            this.observations = this.observations.slice(-MAX_OBSERVATIONS);
        }

        this.log.debug(`Price recorded: 1 LVE = ${priceLVEtoUZS.toFixed(4)} UZS`);
    }

    /**
     * Get Time-Weighted Average Price
     * @param windowMs Time window in milliseconds (default 30 min)
     */
    getTWAP(windowMs: number = DEFAULT_TWAP_WINDOW): {
        lveToUzs: number;
        uzsToLve: number;
        observations: number;
        windowStart: number;
        windowEnd: number;
    } | null {
        if (this.observations.length < MIN_OBSERVATIONS) {
            this.log.warn(`Not enough observations for TWAP (${this.observations.length}/${MIN_OBSERVATIONS})`);
            return null;
        }

        const now = Date.now();
        const windowStart = now - windowMs;

        // Find observations within window
        const windowObs = this.observations.filter(o => o.timestamp >= windowStart);

        if (windowObs.length < MIN_OBSERVATIONS) {
            // Use all available observations
            return this.calculateTWAP(this.observations.slice(-MIN_OBSERVATIONS));
        }

        return this.calculateTWAP(windowObs);
    }

    /**
     * Calculate TWAP from observations
     */
    private calculateTWAP(obs: PriceObservation[]): {
        lveToUzs: number;
        uzsToLve: number;
        observations: number;
        windowStart: number;
        windowEnd: number;
    } {
        if (obs.length < 2) {
            const single = obs[0];
            return {
                lveToUzs: single.priceLVEtoUZS,
                uzsToLve: single.priceUZStoLVE,
                observations: 1,
                windowStart: single.timestamp,
                windowEnd: single.timestamp,
            };
        }

        // Calculate time-weighted average
        let totalWeightedPrice = 0;
        let totalTime = 0;

        for (let i = 1; i < obs.length; i++) {
            const timeDelta = obs[i].timestamp - obs[i - 1].timestamp;
            const avgPrice = (obs[i].priceLVEtoUZS + obs[i - 1].priceLVEtoUZS) / 2;
            totalWeightedPrice += avgPrice * timeDelta;
            totalTime += timeDelta;
        }

        const twapLVEtoUZS = totalTime > 0 ? totalWeightedPrice / totalTime : obs[0].priceLVEtoUZS;
        const twapUZStoLVE = 1 / twapLVEtoUZS;

        return {
            lveToUzs: twapLVEtoUZS,
            uzsToLve: twapUZStoLVE,
            observations: obs.length,
            windowStart: obs[0].timestamp,
            windowEnd: obs[obs.length - 1].timestamp,
        };
    }

    /**
     * Get current spot price (not TWAP)
     */
    getSpotPrice(): { lveToUzs: number; uzsToLve: number } | null {
        if (this.observations.length === 0) {
            return null;
        }

        const latest = this.observations[this.observations.length - 1];
        return {
            lveToUzs: latest.priceLVEtoUZS,
            uzsToLve: latest.priceUZStoLVE,
        };
    }

    /**
     * Check if current price deviates significantly from TWAP
     * Useful for detecting manipulation
     */
    isPriceManipulated(thresholdPercent: number = 10): boolean {
        const spot = this.getSpotPrice();
        const twap = this.getTWAP();

        if (!spot || !twap) {
            return false;
        }

        const deviation = Math.abs((spot.lveToUzs - twap.lveToUzs) / twap.lveToUzs) * 100;

        if (deviation > thresholdPercent) {
            this.log.warn(`⚠️ Price manipulation detected: ${deviation.toFixed(2)}% deviation from TWAP`);
            return true;
        }

        return false;
    }

    /**
     * Get statistics
     */
    getStats(): {
        observations: number;
        oldestTimestamp: number;
        newestTimestamp: number;
    } {
        return {
            observations: this.observations.length,
            oldestTimestamp: this.observations[0]?.timestamp || 0,
            newestTimestamp: this.observations[this.observations.length - 1]?.timestamp || 0,
        };
    }

    /**
     * Load historical observations
     */
    loadObservations(obs: PriceObservation[]): void {
        this.observations = obs.slice(-MAX_OBSERVATIONS);
        this.log.info(`Loaded ${this.observations.length} price observations`);
    }

    /**
     * Export observations for persistence
     */
    exportObservations(): PriceObservation[] {
        return [...this.observations];
    }
}

export const twapOracle = new TWAPOracle();
