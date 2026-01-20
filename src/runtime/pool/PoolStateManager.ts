/**
 * Pool State Manager (Deterministic)
 * 
 * ARCHITECTURE NOTES (DO NOT MODIFY):
 * ====================================
 * 1. POOL STATE IS AUTHORITATIVE - stored on-chain, NOT recomputed from history
 * 2. TRANSACTION.TYPE IS ROUTING ONLY - core does not interpret it
 * 3. AMM IS A MODULE - removable without affecting core chain behavior
 * 
 * DETERMINISM GUARANTEES:
 * - All math uses scaled integers (PRECISION = 1e8)
 * - No floating point operations
 * - No randomness
 * - Fully reproducible across nodes
 * 
 * INVARIANT: x * y >= k (checked on EVERY state transition)
 */

import { logger } from '../../protocol/utils/logger.js';

const log = logger.child('PoolState');

// ========== PRECISION ==========
// All amounts stored as scaled integers: 1 token = PRECISION units
const PRECISION = 100_000_000n;  // 1e8 (satoshi-style)

// Fee: 0.3% = 3/1000
const FEE_NUMERATOR = 3n;
const FEE_DENOMINATOR = 1000n;

// Minimum liquidity to prevent division issues
const MIN_LIQUIDITY = 1000n * PRECISION;

// ========== INTERFACES ==========

export interface OnChainPoolState {
    initialized: boolean;
    reserveLVE: string;     // BigInt as string for JSON
    reserveUSDT: string;    // BigInt as string for JSON
    k: string;              // Invariant x * y >= k
    totalLPTokens: string;
    lpBalances: Record<string, string>;
    createdAtBlock: number;
    lastUpdateBlock: number;
}

export interface PoolOperation {
    type: 'INIT' | 'SWAP' | 'ADD_LIQUIDITY' | 'REMOVE_LIQUIDITY';
    operator: string;
    data: Record<string, unknown>;
    blockIndex: number;
}

export interface SwapParams {
    tokenIn: 'LVE' | 'USDT';
    amountIn: bigint;
    minAmountOut: bigint;
}

export interface LiquidityParams {
    lveAmount: bigint;
    usdtAmount: bigint;
}

// ========== HELPER FUNCTIONS ==========

function toBigInt(value: string | number | bigint): bigint {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number') return BigInt(Math.floor(value * Number(PRECISION)));
    return BigInt(value);
}

function toNumber(value: bigint): number {
    return Number(value) / Number(PRECISION);
}

function sqrt(value: bigint): bigint {
    if (value < 0n) throw new Error('Square root of negative number');
    if (value === 0n) return 0n;

    let x = value;
    let y = (x + 1n) / 2n;
    while (y < x) {
        x = y;
        y = (x + value / x) / 2n;
    }
    return x;
}

// ========== POOL STATE MANAGER ==========

export class PoolStateManager {
    private initialized: boolean = false;
    private reserveLVE: bigint = 0n;
    private reserveUSDT: bigint = 0n;
    private k: bigint = 0n;
    private totalLPTokens: bigint = 0n;
    private lpBalances: Map<string, bigint> = new Map();
    private createdAtBlock: number = 0;
    private lastUpdateBlock: number = 0;

    // ========== INVARIANT CHECK ==========

    /**
     * CRITICAL: Check invariant x * y >= k on EVERY state transition
     * Throws if invariant violated
     */
    private checkInvariant(): void {
        if (!this.initialized) return;

        const currentProduct = this.reserveLVE * this.reserveUSDT;
        if (currentProduct < this.k) {
            throw new Error(`INVARIANT VIOLATION: ${currentProduct} < ${this.k}`);
        }
    }

    // ========== STATE MANAGEMENT ==========

    loadState(data: OnChainPoolState | null): void {
        if (!data || !data.initialized) {
            this.initialized = false;
            this.reserveLVE = 0n;
            this.reserveUSDT = 0n;
            this.k = 0n;
            this.totalLPTokens = 0n;
            this.lpBalances.clear();
            this.createdAtBlock = 0;
            this.lastUpdateBlock = 0;
            return;
        }

        this.initialized = true;
        this.reserveLVE = BigInt(data.reserveLVE);
        this.reserveUSDT = BigInt(data.reserveUSDT);
        this.k = BigInt(data.k);
        this.totalLPTokens = BigInt(data.totalLPTokens);
        this.lpBalances = new Map(
            Object.entries(data.lpBalances).map(([k, v]) => [k, BigInt(v)])
        );
        this.createdAtBlock = data.createdAtBlock;
        this.lastUpdateBlock = data.lastUpdateBlock;

        log.info(`📂 Pool loaded: ${toNumber(this.reserveLVE)} LVE, ${toNumber(this.reserveUSDT)} USDT`);
    }

    getState(): OnChainPoolState {
        return {
            initialized: this.initialized,
            reserveLVE: this.reserveLVE.toString(),
            reserveUSDT: this.reserveUSDT.toString(),
            k: this.k.toString(),
            totalLPTokens: this.totalLPTokens.toString(),
            lpBalances: Object.fromEntries(
                Array.from(this.lpBalances.entries()).map(([k, v]) => [k, v.toString()])
            ),
            createdAtBlock: this.createdAtBlock,
            lastUpdateBlock: this.lastUpdateBlock,
        };
    }

    isInitialized(): boolean {
        return this.initialized;
    }

    // ========== POOL OPERATIONS ==========

    /**
     * Initialize pool with first liquidity
     * ATOMIC: Either succeeds completely or fails with no state change
     */
    initializePool(provider: string, lveAmount: number, usdtAmount: number, blockIndex: number): { lpTokens: number } {
        if (this.initialized) {
            throw new Error('Pool already initialized');
        }

        const lveScaled = toBigInt(lveAmount);
        const usdtScaled = toBigInt(usdtAmount);

        if (lveScaled <= 0n || usdtScaled <= 0n) {
            throw new Error('Amounts must be positive');
        }

        const lpTokens = sqrt(lveScaled * usdtScaled);
        if (lpTokens < MIN_LIQUIDITY) {
            throw new Error(`Initial liquidity too low. Minimum: ${toNumber(MIN_LIQUIDITY)}`);
        }

        // Apply state changes
        this.initialized = true;
        this.reserveLVE = lveScaled;
        this.reserveUSDT = usdtScaled;
        this.k = lveScaled * usdtScaled;
        this.totalLPTokens = lpTokens;
        this.lpBalances.set(provider, lpTokens);
        this.createdAtBlock = blockIndex;
        this.lastUpdateBlock = blockIndex;

        // Verify invariant
        this.checkInvariant();

        log.info(`🏊 Pool initialized at block ${blockIndex}: ${lveAmount} LVE + ${usdtAmount} USDT`);
        return { lpTokens: toNumber(lpTokens) };
    }

    /**
     * Execute swap
     * ATOMIC: Either succeeds or reverts, no partial state
     */
    swap(tokenIn: 'LVE' | 'USDT', amountIn: number, minAmountOut: number, blockIndex: number): { amountOut: number; fee: number } {
        if (!this.initialized) {
            throw new Error('Pool not initialized');
        }

        const amountInScaled = toBigInt(amountIn);
        const minOutScaled = toBigInt(minAmountOut);

        if (amountInScaled <= 0n) {
            throw new Error('Amount must be positive');
        }

        const reserveIn = tokenIn === 'LVE' ? this.reserveLVE : this.reserveUSDT;
        const reserveOut = tokenIn === 'LVE' ? this.reserveUSDT : this.reserveLVE;

        // Calculate fee (integer math: fee = amountIn * 3 / 1000)
        const fee = (amountInScaled * FEE_NUMERATOR) / FEE_DENOMINATOR;
        const amountInAfterFee = amountInScaled - fee;

        // Constant product formula: (reserveIn + amountInAfterFee) * (reserveOut - amountOut) = k
        // Solving for amountOut: amountOut = reserveOut - k / (reserveIn + amountInAfterFee)
        const newReserveIn = reserveIn + amountInAfterFee;
        const amountOut = reserveOut - (this.k / newReserveIn);

        if (amountOut <= 0n || amountOut >= reserveOut) {
            throw new Error('Insufficient liquidity');
        }

        if (amountOut < minOutScaled) {
            throw new Error(`Slippage exceeded. Min: ${minAmountOut}, got: ${toNumber(amountOut)}`);
        }

        // Apply state changes
        if (tokenIn === 'LVE') {
            this.reserveLVE += amountInScaled;
            this.reserveUSDT -= amountOut;
        } else {
            this.reserveUSDT += amountInScaled;
            this.reserveLVE -= amountOut;
        }

        // Update k (increases due to fees)
        this.k = this.reserveLVE * this.reserveUSDT;
        this.lastUpdateBlock = blockIndex;

        // Verify invariant
        this.checkInvariant();

        log.info(`💱 Swap at block ${blockIndex}: ${amountIn} ${tokenIn} → ${toNumber(amountOut).toFixed(6)}`);
        return { amountOut: toNumber(amountOut), fee: toNumber(fee) };
    }

    /**
     * Add liquidity
     * ATOMIC: Either succeeds or reverts
     */
    addLiquidity(provider: string, lveAmount: number, usdtAmount: number, blockIndex: number): { lpTokens: number } {
        if (!this.initialized) {
            return this.initializePool(provider, lveAmount, usdtAmount, blockIndex);
        }

        const lveScaled = toBigInt(lveAmount);
        const usdtScaled = toBigInt(usdtAmount);

        if (lveScaled <= 0n || usdtScaled <= 0n) {
            throw new Error('Amounts must be positive');
        }

        // Check ratio (allow 1% tolerance using integer math)
        // ratio check: |lveScaled * reserveUSDT - usdtScaled * reserveLVE| <= (lveScaled * reserveUSDT) / 100
        const cross1 = lveScaled * this.reserveUSDT;
        const cross2 = usdtScaled * this.reserveLVE;
        const diff = cross1 > cross2 ? cross1 - cross2 : cross2 - cross1;
        const tolerance = cross1 / 100n;

        if (diff > tolerance) {
            throw new Error('Invalid ratio');
        }

        // Calculate LP tokens: lpTokens = (lveAmount / reserveLVE) * totalLP
        const lpTokens = (lveScaled * this.totalLPTokens) / this.reserveLVE;

        // Apply state changes
        this.reserveLVE += lveScaled;
        this.reserveUSDT += usdtScaled;
        this.k = this.reserveLVE * this.reserveUSDT;
        this.totalLPTokens += lpTokens;

        const currentBalance = this.lpBalances.get(provider) || 0n;
        this.lpBalances.set(provider, currentBalance + lpTokens);
        this.lastUpdateBlock = blockIndex;

        // Verify invariant
        this.checkInvariant();

        log.info(`➕ Liquidity added at block ${blockIndex}: ${lveAmount} LVE + ${usdtAmount} USDT`);
        return { lpTokens: toNumber(lpTokens) };
    }

    /**
     * Remove liquidity
     * ATOMIC: Either succeeds or reverts
     */
    removeLiquidity(provider: string, lpTokens: number, blockIndex: number): { lveAmount: number; usdtAmount: number } {
        if (!this.initialized) {
            throw new Error('Pool not initialized');
        }

        const lpTokensScaled = toBigInt(lpTokens);
        const balance = this.lpBalances.get(provider) || 0n;

        if (lpTokensScaled <= 0n || lpTokensScaled > balance) {
            throw new Error(`Invalid LP amount. Balance: ${toNumber(balance)}`);
        }

        // Calculate amounts: amount = (lpTokens / totalLP) * reserve
        const lveAmount = (lpTokensScaled * this.reserveLVE) / this.totalLPTokens;
        const usdtAmount = (lpTokensScaled * this.reserveUSDT) / this.totalLPTokens;

        // Apply state changes
        this.reserveLVE -= lveAmount;
        this.reserveUSDT -= usdtAmount;
        this.k = this.reserveLVE * this.reserveUSDT;
        this.totalLPTokens -= lpTokensScaled;

        const newBalance = balance - lpTokensScaled;
        if (newBalance === 0n) {
            this.lpBalances.delete(provider);
        } else {
            this.lpBalances.set(provider, newBalance);
        }
        this.lastUpdateBlock = blockIndex;

        // Verify invariant
        this.checkInvariant();

        log.info(`➖ Liquidity removed: ${lpTokens} LP → ${toNumber(lveAmount)} LVE + ${toNumber(usdtAmount)} USDT`);
        return { lveAmount: toNumber(lveAmount), usdtAmount: toNumber(usdtAmount) };
    }

    // ========== GETTERS ==========

    getPoolInfo() {
        return {
            initialized: this.initialized,
            reserveLVE: toNumber(this.reserveLVE),
            reserveUSDT: toNumber(this.reserveUSDT),
            k: this.k.toString(),
            totalLPTokens: toNumber(this.totalLPTokens),
            lpProviders: this.lpBalances.size,
            priceLVE: this.initialized ? toNumber(this.reserveUSDT) / toNumber(this.reserveLVE) : 0,
            priceUSDT: this.initialized ? toNumber(this.reserveLVE) / toNumber(this.reserveUSDT) : 0,
            createdAtBlock: this.createdAtBlock,
            lastUpdateBlock: this.lastUpdateBlock,
        };
    }

    getLPBalance(address: string): number {
        return toNumber(this.lpBalances.get(address) || 0n);
    }

    getSwapQuote(tokenIn: 'LVE' | 'USDT', amountIn: number): { amountOut: number; fee: number; priceImpact: number } {
        if (!this.initialized) {
            throw new Error('Pool not initialized');
        }

        const amountInScaled = toBigInt(amountIn);
        const reserveIn = tokenIn === 'LVE' ? this.reserveLVE : this.reserveUSDT;
        const reserveOut = tokenIn === 'LVE' ? this.reserveUSDT : this.reserveLVE;

        const fee = (amountInScaled * FEE_NUMERATOR) / FEE_DENOMINATOR;
        const amountInAfterFee = amountInScaled - fee;
        const newReserveIn = reserveIn + amountInAfterFee;
        const amountOut = reserveOut - (this.k / newReserveIn);

        // Price impact calculation
        const spotPrice = toNumber(reserveOut) / toNumber(reserveIn);
        const executionPrice = toNumber(amountOut) / amountIn;
        const priceImpact = Math.abs((spotPrice - executionPrice) / spotPrice) * 100;

        return {
            amountOut: toNumber(amountOut),
            fee: toNumber(fee),
            priceImpact
        };
    }
}

// ========== SINGLETON ==========

export const poolStateManager = new PoolStateManager();
