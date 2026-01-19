/**
 * Timelock Contract
 * Delays execution of parameter changes for security
 * 
 * All governance parameter changes must go through timelock:
 * - Burn rates
 * - Fee discounts
 * - Staking parameters
 * 
 * Default delay: 7 days (504 blocks at 3 blocks/min)
 */

import { logger } from '../utils/logger.js';
import { sha256 } from '../utils/crypto.js';

// Timelock parameters
const MIN_DELAY_BLOCKS = 504;       // ~7 days at 30s blocks
const MAX_DELAY_BLOCKS = 2016;      // ~28 days
const GRACE_PERIOD_BLOCKS = 336;    // ~2 days to execute after ready

type OperationType = 'burn_rate' | 'fee_discount' | 'staking' | 'governance' | 'other';

interface TimelockOperation {
    id: string;
    operationType: OperationType;
    target: string;
    data: Record<string, unknown>;
    proposer: string;
    proposedAtBlock: number;
    executeAfterBlock: number;
    executedAtBlock?: number;
    cancelledAtBlock?: number;
    status: 'pending' | 'ready' | 'executed' | 'cancelled' | 'expired';
}

export class TimelockManager {
    private operations: Map<string, TimelockOperation> = new Map();
    private executedOperations: string[] = [];
    private log = logger.child('Timelock');

    /**
     * Queue a new operation for timelock
     */
    queueOperation(
        operationType: OperationType,
        target: string,
        data: Record<string, unknown>,
        proposer: string,
        currentBlock: number,
        delayBlocks: number = MIN_DELAY_BLOCKS
    ): TimelockOperation {
        // Validate delay
        if (delayBlocks < MIN_DELAY_BLOCKS) {
            throw new Error(`Delay too short. Minimum: ${MIN_DELAY_BLOCKS} blocks`);
        }
        if (delayBlocks > MAX_DELAY_BLOCKS) {
            throw new Error(`Delay too long. Maximum: ${MAX_DELAY_BLOCKS} blocks`);
        }

        const id = sha256(
            operationType + target + JSON.stringify(data) + proposer + currentBlock.toString()
        ).slice(0, 16);

        const operation: TimelockOperation = {
            id,
            operationType,
            target,
            data,
            proposer,
            proposedAtBlock: currentBlock,
            executeAfterBlock: currentBlock + delayBlocks,
            status: 'pending',
        };

        this.operations.set(id, operation);

        this.log.info(`⏰ Timelock queued: ${operationType} | Ready at block ${operation.executeAfterBlock}`);
        return operation;
    }

    /**
     * Check if operation is ready for execution
     */
    isReady(operationId: string, currentBlock: number): boolean {
        const op = this.operations.get(operationId);
        if (!op) return false;

        if (op.status !== 'pending' && op.status !== 'ready') return false;

        if (currentBlock < op.executeAfterBlock) return false;

        // Check grace period
        if (currentBlock > op.executeAfterBlock + GRACE_PERIOD_BLOCKS) {
            op.status = 'expired';
            return false;
        }

        op.status = 'ready';
        return true;
    }

    /**
     * Execute a ready operation
     */
    executeOperation(operationId: string, currentBlock: number): TimelockOperation {
        if (!this.isReady(operationId, currentBlock)) {
            const op = this.operations.get(operationId);
            if (!op) throw new Error('Operation not found');

            if (op.status === 'expired') {
                throw new Error('Operation expired');
            }
            if (op.status === 'executed') {
                throw new Error('Operation already executed');
            }
            if (op.status === 'cancelled') {
                throw new Error('Operation was cancelled');
            }

            throw new Error(`Operation not ready. Ready at block ${op.executeAfterBlock}`);
        }

        const op = this.operations.get(operationId)!;
        op.status = 'executed';
        op.executedAtBlock = currentBlock;

        this.executedOperations.push(operationId);

        this.log.info(`✅ Timelock executed: ${op.operationType} at block ${currentBlock}`);
        return op;
    }

    /**
     * Cancel a pending operation
     */
    cancelOperation(operationId: string, canceller: string, currentBlock: number): boolean {
        const op = this.operations.get(operationId);
        if (!op) throw new Error('Operation not found');

        if (op.status !== 'pending' && op.status !== 'ready') {
            throw new Error(`Cannot cancel: operation is ${op.status}`);
        }

        // Only proposer can cancel
        if (op.proposer !== canceller) {
            throw new Error('Only proposer can cancel');
        }

        op.status = 'cancelled';
        op.cancelledAtBlock = currentBlock;

        this.log.info(`❌ Timelock cancelled: ${op.operationType}`);
        return true;
    }

    /**
     * Get pending operations
     */
    getPendingOperations(): TimelockOperation[] {
        return Array.from(this.operations.values()).filter(
            op => op.status === 'pending' || op.status === 'ready'
        );
    }

    /**
     * Get operation by ID
     */
    getOperation(id: string): TimelockOperation | undefined {
        return this.operations.get(id);
    }

    /**
     * Get time remaining until execution (in blocks)
     */
    getTimeRemaining(operationId: string, currentBlock: number): number {
        const op = this.operations.get(operationId);
        if (!op) return -1;

        return Math.max(0, op.executeAfterBlock - currentBlock);
    }
}

export const timelockManager = new TimelockManager();

// Export constants
export const TIMELOCK_PARAMS = {
    MIN_DELAY_BLOCKS,
    MAX_DELAY_BLOCKS,
    GRACE_PERIOD_BLOCKS,
};
