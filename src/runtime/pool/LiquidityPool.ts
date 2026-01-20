/**
 * Liquidity Pool - On-Chain AMM Implementation
 * 
 * CONSTRAINTS:
 * - NO testnet-only shortcuts
 * - NO admin-only bypasses
 * - NO network-dependent logic
 * 
 * Formula: x * y = k (Constant Product AMM)
 * Fee: 0.3%
 */

import { logger } from '../../protocol/utils/logger.js';

const log = logger.child('Pool');

// Constants
const FEE_NUMERATOR = 3;      // 0.3%
const FEE_DENOMINATOR = 1000;
const MIN_LIQUIDITY = 1000;   // Minimum initial liquidity (prevents division issues)

// ========== INTERFACES ==========

export interface PoolState {
    reserveLVE: number;
    reserveUZS: number;
    k: number;                    // Constant product (reserveLVE * reserveUZS)
    totalLPTokens: number;
    lpBalances: Record<string, number>;  // address -> LP token balance
    createdAt: number;
    lastSwapAt: number;
}

export interface SwapResult {
    amountIn: number;
    amountOut: number;
    fee: number;
    priceImpact: number;
    newReserveLVE: number;
    newReserveUZS: number;
}

export interface LiquidityResult {
    lpTokensMinted: number;
    lveAdded: number;
    uzsAdded: number;
}

export interface RemoveLiquidityResult {
    lpTokensBurned: number;
    lveReceived: number;
    uzsReceived: number;
}

// ========== LIQUIDITY POOL CLASS ==========

export class LiquidityPool {
    private state: PoolState;

    constructor() {
        this.state = {
            reserveLVE: 0,
            reserveUZS: 0,
            k: 0,
            totalLPTokens: 0,
            lpBalances: {},
            createdAt: 0,
            lastSwapAt: 0,
        };
    }

    // ========== INITIALIZATION ==========

    /**
     * Initialize pool with initial liquidity
     * First liquidity provider sets the initial price
     */
    initializePool(provider: string, lveAmount: number, uzsAmount: number): LiquidityResult {
        if (this.state.reserveLVE > 0 || this.state.reserveUZS > 0) {
            throw new Error('Pool already initialized');
        }

        if (lveAmount <= 0 || uzsAmount <= 0) {
            throw new Error('Amounts must be positive');
        }

        // Calculate initial LP tokens (geometric mean)
        const lpTokens = Math.sqrt(lveAmount * uzsAmount);

        if (lpTokens < MIN_LIQUIDITY) {
            throw new Error(`Initial liquidity too low. Minimum: ${MIN_LIQUIDITY}`);
        }

        this.state.reserveLVE = lveAmount;
        this.state.reserveUZS = uzsAmount;
        this.state.k = lveAmount * uzsAmount;
        this.state.totalLPTokens = lpTokens;
        this.state.lpBalances[provider] = lpTokens;
        this.state.createdAt = Date.now();

        log.info(`🏊 Pool initialized: ${lveAmount} LVE + ${uzsAmount} UZS = ${lpTokens} LP`);

        return {
            lpTokensMinted: lpTokens,
            lveAdded: lveAmount,
            uzsAdded: uzsAmount,
        };
    }

    // ========== SWAP ==========

    /**
     * Calculate swap output (read-only quote)
     */
    getSwapQuote(tokenIn: 'LVE' | 'UZS', amountIn: number): SwapResult {
        if (!this.isInitialized()) {
            throw new Error('Pool not initialized');
        }

        if (amountIn <= 0) {
            throw new Error('Amount must be positive');
        }

        const reserveIn = tokenIn === 'LVE' ? this.state.reserveLVE : this.state.reserveUZS;
        const reserveOut = tokenIn === 'LVE' ? this.state.reserveUZS : this.state.reserveLVE;

        // Calculate fee
        const fee = (amountIn * FEE_NUMERATOR) / FEE_DENOMINATOR;
        const amountInAfterFee = amountIn - fee;

        // Constant product formula: (x + dx) * (y - dy) = k
        // dy = y - k / (x + dx)
        const amountOut = reserveOut - (this.state.k / (reserveIn + amountInAfterFee));

        if (amountOut <= 0) {
            throw new Error('Insufficient liquidity');
        }

        if (amountOut >= reserveOut) {
            throw new Error('Insufficient liquidity for this swap');
        }

        // Calculate price impact
        const spotPrice = reserveOut / reserveIn;
        const executionPrice = amountOut / amountIn;
        const priceImpact = Math.abs((spotPrice - executionPrice) / spotPrice) * 100;

        // Calculate new reserves
        const newReserveIn = reserveIn + amountIn;
        const newReserveOut = reserveOut - amountOut;

        return {
            amountIn,
            amountOut,
            fee,
            priceImpact,
            newReserveLVE: tokenIn === 'LVE' ? newReserveIn : newReserveOut,
            newReserveUZS: tokenIn === 'LVE' ? newReserveOut : newReserveIn,
        };
    }

    /**
     * Execute swap (mutates state)
     * Returns actual amounts swapped
     */
    swap(tokenIn: 'LVE' | 'UZS', amountIn: number, minAmountOut: number): SwapResult {
        const quote = this.getSwapQuote(tokenIn, amountIn);

        // Slippage check
        if (quote.amountOut < minAmountOut) {
            throw new Error(`Slippage exceeded. Expected min: ${minAmountOut}, got: ${quote.amountOut}`);
        }

        // Update state
        this.state.reserveLVE = quote.newReserveLVE;
        this.state.reserveUZS = quote.newReserveUZS;
        this.state.lastSwapAt = Date.now();

        // Verify invariant: k should only increase (due to fees)
        const newK = this.state.reserveLVE * this.state.reserveUZS;
        if (newK < this.state.k) {
            throw new Error('Invariant violation: k decreased');
        }
        this.state.k = newK;

        log.info(`💱 Swap: ${amountIn} ${tokenIn} → ${quote.amountOut.toFixed(6)} ${tokenIn === 'LVE' ? 'UZS' : 'LVE'}`);

        return quote;
    }

    // ========== ADD LIQUIDITY ==========

    /**
     * Add liquidity to pool
     * Must add both tokens in current ratio
     */
    addLiquidity(provider: string, lveAmount: number, uzsAmount: number): LiquidityResult {
        if (!this.isInitialized()) {
            return this.initializePool(provider, lveAmount, uzsAmount);
        }

        if (lveAmount <= 0 || uzsAmount <= 0) {
            throw new Error('Amounts must be positive');
        }

        // Calculate optimal ratio
        const currentRatio = this.state.reserveLVE / this.state.reserveUZS;
        const providedRatio = lveAmount / uzsAmount;

        // Allow 1% ratio deviation
        const ratioDiff = Math.abs(currentRatio - providedRatio) / currentRatio;
        if (ratioDiff > 0.01) {
            const optimalUZS = lveAmount / currentRatio;
            throw new Error(`Invalid ratio. For ${lveAmount} LVE, provide ~${optimalUZS.toFixed(2)} UZS`);
        }

        // Calculate LP tokens to mint (proportional to contribution)
        const lpTokens = (lveAmount / this.state.reserveLVE) * this.state.totalLPTokens;

        // Update reserves
        this.state.reserveLVE += lveAmount;
        this.state.reserveUZS += uzsAmount;
        this.state.k = this.state.reserveLVE * this.state.reserveUZS;

        // Mint LP tokens
        this.state.totalLPTokens += lpTokens;
        this.state.lpBalances[provider] = (this.state.lpBalances[provider] || 0) + lpTokens;

        log.info(`➕ Liquidity added: ${lveAmount} LVE + ${uzsAmount} UZS = ${lpTokens.toFixed(4)} LP`);

        return {
            lpTokensMinted: lpTokens,
            lveAdded: lveAmount,
            uzsAdded: uzsAmount,
        };
    }

    // ========== REMOVE LIQUIDITY ==========

    /**
     * Remove liquidity from pool
     * Burns LP tokens and returns proportional share of reserves
     */
    removeLiquidity(provider: string, lpTokens: number): RemoveLiquidityResult {
        if (!this.isInitialized()) {
            throw new Error('Pool not initialized');
        }

        const providerBalance = this.state.lpBalances[provider] || 0;
        if (lpTokens <= 0 || lpTokens > providerBalance) {
            throw new Error(`Invalid LP amount. Your balance: ${providerBalance}`);
        }

        // Calculate proportional share
        const share = lpTokens / this.state.totalLPTokens;
        const lveReceived = this.state.reserveLVE * share;
        const uzsReceived = this.state.reserveUZS * share;

        // Update reserves
        this.state.reserveLVE -= lveReceived;
        this.state.reserveUZS -= uzsReceived;
        this.state.k = this.state.reserveLVE * this.state.reserveUZS;

        // Burn LP tokens
        this.state.totalLPTokens -= lpTokens;
        this.state.lpBalances[provider] -= lpTokens;

        if (this.state.lpBalances[provider] === 0) {
            delete this.state.lpBalances[provider];
        }

        log.info(`➖ Liquidity removed: ${lpTokens.toFixed(4)} LP → ${lveReceived.toFixed(4)} LVE + ${uzsReceived.toFixed(4)} UZS`);

        return {
            lpTokensBurned: lpTokens,
            lveReceived,
            uzsReceived,
        };
    }

    // ========== GETTERS ==========

    isInitialized(): boolean {
        return this.state.reserveLVE > 0 && this.state.reserveUZS > 0;
    }

    getReserves(): { lve: number; uzs: number } {
        return { lve: this.state.reserveLVE, uzs: this.state.reserveUZS };
    }

    getPrice(): { lvePerUsdt: number; uzsPerEdu: number } {
        if (!this.isInitialized()) {
            return { lvePerUsdt: 0, uzsPerEdu: 0 };
        }
        return {
            lvePerUsdt: this.state.reserveLVE / this.state.reserveUZS,
            uzsPerEdu: this.state.reserveUZS / this.state.reserveLVE,
        };
    }

    getLPBalance(address: string): number {
        return this.state.lpBalances[address] || 0;
    }

    getTotalLPTokens(): number {
        return this.state.totalLPTokens;
    }

    getPoolInfo() {
        const price = this.getPrice();
        return {
            initialized: this.isInitialized(),
            reserveLVE: this.state.reserveLVE,
            reserveUZS: this.state.reserveUZS,
            k: this.state.k,
            totalLPTokens: this.state.totalLPTokens,
            lpProviders: Object.keys(this.state.lpBalances).length,
            priceLVE: price.uzsPerEdu,  // Price of 1 LVE in UZS
            priceUZS: price.lvePerUsdt, // Price of 1 UZS in LVE
            createdAt: this.state.createdAt,
            lastSwapAt: this.state.lastSwapAt,
        };
    }

    // ========== SERIALIZATION ==========

    toJSON(): PoolState {
        return { ...this.state };
    }

    loadFromData(data: PoolState): void {
        this.state = { ...data };
        log.info(`📂 Pool state loaded: ${this.state.reserveLVE} LVE, ${this.state.reserveUZS} UZS`);
    }
}

// ========== SINGLETON EXPORT ==========

export const liquidityPool = new LiquidityPool();
