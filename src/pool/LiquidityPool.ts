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

import { logger } from '../utils/logger.js';

const log = logger.child('Pool');

// Constants
const FEE_NUMERATOR = 3;      // 0.3%
const FEE_DENOMINATOR = 1000;
const MIN_LIQUIDITY = 1000;   // Minimum initial liquidity (prevents division issues)

// ========== INTERFACES ==========

export interface PoolState {
    reserveEDU: number;
    reserveUSDT: number;
    k: number;                    // Constant product (reserveEDU * reserveUSDT)
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
    newReserveEDU: number;
    newReserveUSDT: number;
}

export interface LiquidityResult {
    lpTokensMinted: number;
    eduAdded: number;
    usdtAdded: number;
}

export interface RemoveLiquidityResult {
    lpTokensBurned: number;
    eduReceived: number;
    usdtReceived: number;
}

// ========== LIQUIDITY POOL CLASS ==========

export class LiquidityPool {
    private state: PoolState;

    constructor() {
        this.state = {
            reserveEDU: 0,
            reserveUSDT: 0,
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
    initializePool(provider: string, eduAmount: number, usdtAmount: number): LiquidityResult {
        if (this.state.reserveEDU > 0 || this.state.reserveUSDT > 0) {
            throw new Error('Pool already initialized');
        }

        if (eduAmount <= 0 || usdtAmount <= 0) {
            throw new Error('Amounts must be positive');
        }

        // Calculate initial LP tokens (geometric mean)
        const lpTokens = Math.sqrt(eduAmount * usdtAmount);

        if (lpTokens < MIN_LIQUIDITY) {
            throw new Error(`Initial liquidity too low. Minimum: ${MIN_LIQUIDITY}`);
        }

        this.state.reserveEDU = eduAmount;
        this.state.reserveUSDT = usdtAmount;
        this.state.k = eduAmount * usdtAmount;
        this.state.totalLPTokens = lpTokens;
        this.state.lpBalances[provider] = lpTokens;
        this.state.createdAt = Date.now();

        log.info(`🏊 Pool initialized: ${eduAmount} EDU + ${usdtAmount} USDT = ${lpTokens} LP`);

        return {
            lpTokensMinted: lpTokens,
            eduAdded: eduAmount,
            usdtAdded: usdtAmount,
        };
    }

    // ========== SWAP ==========

    /**
     * Calculate swap output (read-only quote)
     */
    getSwapQuote(tokenIn: 'EDU' | 'USDT', amountIn: number): SwapResult {
        if (!this.isInitialized()) {
            throw new Error('Pool not initialized');
        }

        if (amountIn <= 0) {
            throw new Error('Amount must be positive');
        }

        const reserveIn = tokenIn === 'EDU' ? this.state.reserveEDU : this.state.reserveUSDT;
        const reserveOut = tokenIn === 'EDU' ? this.state.reserveUSDT : this.state.reserveEDU;

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
            newReserveEDU: tokenIn === 'EDU' ? newReserveIn : newReserveOut,
            newReserveUSDT: tokenIn === 'EDU' ? newReserveOut : newReserveIn,
        };
    }

    /**
     * Execute swap (mutates state)
     * Returns actual amounts swapped
     */
    swap(tokenIn: 'EDU' | 'USDT', amountIn: number, minAmountOut: number): SwapResult {
        const quote = this.getSwapQuote(tokenIn, amountIn);

        // Slippage check
        if (quote.amountOut < minAmountOut) {
            throw new Error(`Slippage exceeded. Expected min: ${minAmountOut}, got: ${quote.amountOut}`);
        }

        // Update state
        this.state.reserveEDU = quote.newReserveEDU;
        this.state.reserveUSDT = quote.newReserveUSDT;
        this.state.lastSwapAt = Date.now();

        // Verify invariant: k should only increase (due to fees)
        const newK = this.state.reserveEDU * this.state.reserveUSDT;
        if (newK < this.state.k) {
            throw new Error('Invariant violation: k decreased');
        }
        this.state.k = newK;

        log.info(`💱 Swap: ${amountIn} ${tokenIn} → ${quote.amountOut.toFixed(6)} ${tokenIn === 'EDU' ? 'USDT' : 'EDU'}`);

        return quote;
    }

    // ========== ADD LIQUIDITY ==========

    /**
     * Add liquidity to pool
     * Must add both tokens in current ratio
     */
    addLiquidity(provider: string, eduAmount: number, usdtAmount: number): LiquidityResult {
        if (!this.isInitialized()) {
            return this.initializePool(provider, eduAmount, usdtAmount);
        }

        if (eduAmount <= 0 || usdtAmount <= 0) {
            throw new Error('Amounts must be positive');
        }

        // Calculate optimal ratio
        const currentRatio = this.state.reserveEDU / this.state.reserveUSDT;
        const providedRatio = eduAmount / usdtAmount;

        // Allow 1% ratio deviation
        const ratioDiff = Math.abs(currentRatio - providedRatio) / currentRatio;
        if (ratioDiff > 0.01) {
            const optimalUSDT = eduAmount / currentRatio;
            throw new Error(`Invalid ratio. For ${eduAmount} EDU, provide ~${optimalUSDT.toFixed(2)} USDT`);
        }

        // Calculate LP tokens to mint (proportional to contribution)
        const lpTokens = (eduAmount / this.state.reserveEDU) * this.state.totalLPTokens;

        // Update reserves
        this.state.reserveEDU += eduAmount;
        this.state.reserveUSDT += usdtAmount;
        this.state.k = this.state.reserveEDU * this.state.reserveUSDT;

        // Mint LP tokens
        this.state.totalLPTokens += lpTokens;
        this.state.lpBalances[provider] = (this.state.lpBalances[provider] || 0) + lpTokens;

        log.info(`➕ Liquidity added: ${eduAmount} EDU + ${usdtAmount} USDT = ${lpTokens.toFixed(4)} LP`);

        return {
            lpTokensMinted: lpTokens,
            eduAdded: eduAmount,
            usdtAdded: usdtAmount,
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
        const eduReceived = this.state.reserveEDU * share;
        const usdtReceived = this.state.reserveUSDT * share;

        // Update reserves
        this.state.reserveEDU -= eduReceived;
        this.state.reserveUSDT -= usdtReceived;
        this.state.k = this.state.reserveEDU * this.state.reserveUSDT;

        // Burn LP tokens
        this.state.totalLPTokens -= lpTokens;
        this.state.lpBalances[provider] -= lpTokens;

        if (this.state.lpBalances[provider] === 0) {
            delete this.state.lpBalances[provider];
        }

        log.info(`➖ Liquidity removed: ${lpTokens.toFixed(4)} LP → ${eduReceived.toFixed(4)} EDU + ${usdtReceived.toFixed(4)} USDT`);

        return {
            lpTokensBurned: lpTokens,
            eduReceived,
            usdtReceived,
        };
    }

    // ========== GETTERS ==========

    isInitialized(): boolean {
        return this.state.reserveEDU > 0 && this.state.reserveUSDT > 0;
    }

    getReserves(): { edu: number; usdt: number } {
        return { edu: this.state.reserveEDU, usdt: this.state.reserveUSDT };
    }

    getPrice(): { eduPerUsdt: number; usdtPerEdu: number } {
        if (!this.isInitialized()) {
            return { eduPerUsdt: 0, usdtPerEdu: 0 };
        }
        return {
            eduPerUsdt: this.state.reserveEDU / this.state.reserveUSDT,
            usdtPerEdu: this.state.reserveUSDT / this.state.reserveEDU,
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
            reserveEDU: this.state.reserveEDU,
            reserveUSDT: this.state.reserveUSDT,
            k: this.state.k,
            totalLPTokens: this.state.totalLPTokens,
            lpProviders: Object.keys(this.state.lpBalances).length,
            priceEDU: price.usdtPerEdu,  // Price of 1 EDU in USDT
            priceUSDT: price.eduPerUsdt, // Price of 1 USDT in EDU
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
        log.info(`📂 Pool state loaded: ${this.state.reserveEDU} EDU, ${this.state.reserveUSDT} USDT`);
    }
}

// ========== SINGLETON EXPORT ==========

export const liquidityPool = new LiquidityPool();
