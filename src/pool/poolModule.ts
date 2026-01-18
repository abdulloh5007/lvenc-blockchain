/**
 * Pool Module - Transaction Processing
 * 
 * ARCHITECTURE NOTES (DO NOT MODIFY):
 * ====================================
 * 1. POOL STATE IS AUTHORITATIVE - stored on-chain, NOT recomputed from history
 * 2. TRANSACTION.TYPE IS ROUTING ONLY - core does not interpret pool transactions
 * 3. AMM IS A MODULE - removable without affecting core chain behavior
 * 4. THIS MODULE CAN BE DELETED without breaking the blockchain
 * 
 * TRANSACTION ROUTING:
 * - Pool transactions identified by toAddress = "POOL_LVE_UZS"
 * - Core does NOT understand or special-case this address
 * - Operation type encoded in amount field
 * 
 * FAILURE SEMANTICS:
 * - Failed pool tx = state reverted for that tx only
 * - Block execution continues normally
 * - Failed transactions do NOT affect other transactions in block
 * 
 * DETERMINISM:
 * - All computations in PoolStateManager use integer math (BigInt)
 * - No floating point, no randomness
 * 
 * CONSTRAINTS:
 * - NO changes to Transaction.ts
 * - NO changes to Blockchain.ts
 * - NO changes to Block.ts
 * - Module-based, fully isolated
 */

import { Transaction } from '../blockchain/Transaction.js';
import { poolStateManager } from './PoolStateManager.js';
import { storage } from '../storage/index.js';
import { logger } from '../utils/logger.js';

const log = logger.child('PoolModule');

// Pool contract address convention
export const POOL_ADDRESS = 'POOL_LVE_UZS';

// Operation codes
const OP_SWAP_LVE_TO_UZS = 1;
const OP_SWAP_UZS_TO_LVE = 2;
const OP_ADD_LIQUIDITY = 3;
const OP_REMOVE_LIQUIDITY = 4;

const OP_MULTIPLIER = 1_000_000;

/**
 * Check if transaction is a pool operation
 */
export function isPoolTransaction(tx: Transaction): boolean {
    return tx.toAddress === POOL_ADDRESS;
}

/**
 * Encode pool operation into transaction amount
 */
export function encodePoolOperation(opCode: number, amount: number): number {
    return opCode * OP_MULTIPLIER + Math.floor(amount * 10000) / 10000;
}

/**
 * Decode pool operation from transaction amount
 */
export function decodePoolOperation(encodedAmount: number): { opCode: number; amount: number } {
    const opCode = Math.floor(encodedAmount / OP_MULTIPLIER);
    const amount = encodedAmount % OP_MULTIPLIER;
    return { opCode, amount };
}

/**
 * Process pool transaction from a block
 * Called when processing blocks (new or synced)
 */
export function processPoolTransaction(tx: Transaction, blockIndex: number): boolean {
    if (!isPoolTransaction(tx)) {
        return false;
    }

    const { opCode, amount } = decodePoolOperation(tx.amount);
    const operator = tx.fromAddress || '';

    try {
        switch (opCode) {
            case OP_SWAP_LVE_TO_UZS:
                poolStateManager.swap('LVE', amount, 0, blockIndex);
                log.info(`🔄 Block ${blockIndex}: Swap ${amount} LVE → UZS by ${operator.slice(0, 12)}...`);
                break;

            case OP_SWAP_UZS_TO_LVE:
                poolStateManager.swap('UZS', amount, 0, blockIndex);
                log.info(`🔄 Block ${blockIndex}: Swap ${amount} UZS → LVE by ${operator.slice(0, 12)}...`);
                break;

            case OP_ADD_LIQUIDITY:
                // For add liquidity, UZS amount is encoded in fee field (hack but no core changes)
                const uzsAmount = tx.fee;
                poolStateManager.addLiquidity(operator, amount, uzsAmount, blockIndex);
                log.info(`➕ Block ${blockIndex}: Add liquidity ${amount} LVE + ${uzsAmount} UZS`);
                break;

            case OP_REMOVE_LIQUIDITY:
                poolStateManager.removeLiquidity(operator, amount, blockIndex);
                log.info(`➖ Block ${blockIndex}: Remove ${amount} LP tokens`);
                break;

            default:
                log.warn(`Unknown pool operation: ${opCode}`);
                return false;
        }

        // Save updated pool state
        storage.savePool(poolStateManager.getState());
        return true;

    } catch (error) {
        log.error(`Pool operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return false;
    }
}

/**
 * Process all pool transactions in a block
 */
export function processBlockPoolOperations(transactions: Transaction[], blockIndex: number): number {
    let processedCount = 0;

    for (const tx of transactions) {
        if (processPoolTransaction(tx, blockIndex)) {
            processedCount++;
        }
    }

    return processedCount;
}

/**
 * Create pool swap transaction
 */
export function createSwapTransaction(
    fromAddress: string,
    tokenIn: 'LVE' | 'UZS',
    amountIn: number,
    fee: number = 0.001
): Transaction {
    const opCode = tokenIn === 'LVE' ? OP_SWAP_LVE_TO_UZS : OP_SWAP_UZS_TO_LVE;
    const encodedAmount = encodePoolOperation(opCode, amountIn);

    return new Transaction(
        fromAddress,
        POOL_ADDRESS,
        encodedAmount,
        fee
    );
}

/**
 * Create add liquidity transaction
 */
export function createAddLiquidityTransaction(
    fromAddress: string,
    lveAmount: number,
    uzsAmount: number
): Transaction {
    const encodedAmount = encodePoolOperation(OP_ADD_LIQUIDITY, lveAmount);

    // Use fee field to encode UZS amount (hack but no core changes)
    return new Transaction(
        fromAddress,
        POOL_ADDRESS,
        encodedAmount,
        uzsAmount  // UZS amount stored in fee field
    );
}

/**
 * Create remove liquidity transaction
 */
export function createRemoveLiquidityTransaction(
    fromAddress: string,
    lpTokens: number
): Transaction {
    const encodedAmount = encodePoolOperation(OP_REMOVE_LIQUIDITY, lpTokens);

    return new Transaction(
        fromAddress,
        POOL_ADDRESS,
        encodedAmount,
        0.001  // Standard fee
    );
}
