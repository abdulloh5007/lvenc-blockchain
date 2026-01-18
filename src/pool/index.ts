/**
 * Pool Module Exports
 */

export { LiquidityPool, liquidityPool } from './LiquidityPool.js';
export type {
    PoolState,
    SwapResult,
    LiquidityResult,
    RemoveLiquidityResult,
} from './LiquidityPool.js';

// On-Chain Pool State Manager
export { PoolStateManager, poolStateManager } from './PoolStateManager.js';
export type { OnChainPoolState, PoolOperation, SwapParams, LiquidityParams } from './PoolStateManager.js';

// Pool Module - Transaction Processing
export {
    POOL_ADDRESS,
    isPoolTransaction,
    processPoolTransaction,
    processBlockPoolOperations,
    createSwapTransaction,
    createAddLiquidityTransaction,
    createRemoveLiquidityTransaction,
} from './poolModule.js';
