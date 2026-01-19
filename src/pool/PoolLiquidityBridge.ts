/**
 * Pool Liquidity Bridge
 * Connects TokenSupplyManager with PoolStateManager
 * 
 * RULES:
 * 1. All pool liquidity comes from LIQUIDITY allocation
 * 2. releaseTokens() is called before adding to pool
 * 3. Mint is NEVER used - only release from allocation
 * 4. Price is determined by AMM, not supply logic
 * 
 * INITIAL LIQUIDITY (mainnet/testnet):
 * - 100,000 LVE + 5,000,000 USDT
 * - Starting price: 1 LVE = 50 USDT
 */

import { tokenSupplyManager, ALLOCATIONS } from '../blockchain/TokenSupplyManager.js';
import { poolStateManager } from './PoolStateManager.js';
import { tokenBurnManager } from '../blockchain/TokenBurnManager.js';
import { logger } from '../utils/logger.js';

const log = logger.child('PoolBridge');

// Initial liquidity parameters
const INITIAL_LVE_LIQUIDITY = 100_000;      // 100K LVE
const INITIAL_USDT_LIQUIDITY = 5_000_000;    // 5M USDT (1 LVE = 50 USDT)

// Track released liquidity
let releasedLiquidity = 0;

/**
 * Initialize pool with liquidity from LIQUIDITY allocation
 * This is the ONLY way to add initial liquidity
 */
export function initializePoolFromAllocation(
    provider: string,
    blockIndex: number,
    lveAmount: number = INITIAL_LVE_LIQUIDITY,
    usdtAmount: number = INITIAL_USDT_LIQUIDITY
): { lpTokens: number; startPrice: number } {
    // Check if pool already initialized
    if (poolStateManager.isInitialized()) {
        throw new Error('Pool already initialized');
    }

    // Check available liquidity in allocation
    const allocation = tokenSupplyManager.getAllocation('LIQUIDITY');
    if (lveAmount > allocation.locked) {
        throw new Error(`Insufficient LIQUIDITY allocation: need ${lveAmount}, have ${allocation.locked} locked`);
    }

    // Release tokens from LIQUIDITY allocation (this is NOT minting!)
    const released = tokenSupplyManager.releaseTokens('LIQUIDITY', lveAmount, blockIndex);
    if (!released) {
        throw new Error('Failed to release tokens from LIQUIDITY allocation');
    }

    releasedLiquidity += lveAmount;

    // Initialize pool with released tokens
    const result = poolStateManager.initializePool(provider, lveAmount, usdtAmount, blockIndex);

    const startPrice = usdtAmount / lveAmount;

    log.info(`🚀 Pool initialized from LIQUIDITY allocation:`);
    log.info(`   📊 ${lveAmount.toLocaleString()} LVE + ${usdtAmount.toLocaleString()} USDT`);
    log.info(`   💰 Starting price: 1 LVE = ${startPrice} USDT`);
    log.info(`   🎫 LP tokens: ${result.lpTokens.toLocaleString()}`);

    return {
        lpTokens: result.lpTokens,
        startPrice,
    };
}

/**
 * Add more liquidity from LIQUIDITY allocation (governance approved)
 */
export function addLiquidityFromAllocation(
    provider: string,
    lveAmount: number,
    usdtAmount: number,
    blockIndex: number
): { lpTokens: number } {
    if (!poolStateManager.isInitialized()) {
        throw new Error('Pool not initialized. Use initializePoolFromAllocation first.');
    }

    // Check available liquidity
    const allocation = tokenSupplyManager.getAllocation('LIQUIDITY');
    if (lveAmount > allocation.locked) {
        throw new Error(`Insufficient LIQUIDITY allocation: need ${lveAmount}, have ${allocation.locked} locked`);
    }

    // Release tokens from allocation
    const released = tokenSupplyManager.releaseTokens('LIQUIDITY', lveAmount, blockIndex);
    if (!released) {
        throw new Error('Failed to release tokens from LIQUIDITY allocation');
    }

    releasedLiquidity += lveAmount;

    // Add to pool
    const result = poolStateManager.addLiquidity(provider, lveAmount, usdtAmount, blockIndex);

    log.info(`➕ Added ${lveAmount.toLocaleString()} LVE from LIQUIDITY allocation`);

    return result;
}

/**
 * Record swap burn (30% of swap fee is burned)
 */
export function recordSwapWithBurn(
    tokenIn: 'LVE' | 'USDT',
    amountIn: number,
    minAmountOut: number,
    blockIndex: number
): { amountOut: number; fee: number; burned: number } {
    const result = poolStateManager.swap(tokenIn, amountIn, minAmountOut, blockIndex);

    // Burn portion of fee (only if LVE fee)
    let burned = 0;
    if (tokenIn === 'LVE') {
        burned = tokenBurnManager.burnFromSwapFee(result.fee, blockIndex);
        tokenSupplyManager.recordBurn(burned, 'CIRCULATING', blockIndex);
    }

    return {
        amountOut: result.amountOut,
        fee: result.fee,
        burned,
    };
}

/**
 * Get liquidity status
 */
export function getLiquidityStatus(): {
    totalAllocation: number;
    released: number;
    locked: number;
    inPool: number;
    burned: number;
} {
    const allocation = tokenSupplyManager.getAllocation('LIQUIDITY');
    const poolInfo = poolStateManager.getPoolInfo();

    return {
        totalAllocation: ALLOCATIONS.LIQUIDITY,
        released: allocation.released,
        locked: allocation.locked,
        inPool: poolInfo.reserveLVE,
        burned: allocation.burned,
    };
}

/**
 * Get initial liquidity parameters
 */
export function getInitialLiquidityParams(): {
    lve: number;
    usdt: number;
    startPrice: number;
} {
    return {
        lve: INITIAL_LVE_LIQUIDITY,
        usdt: INITIAL_USDT_LIQUIDITY,
        startPrice: INITIAL_USDT_LIQUIDITY / INITIAL_LVE_LIQUIDITY,
    };
}

// Export constants
export { INITIAL_LVE_LIQUIDITY, INITIAL_USDT_LIQUIDITY };
