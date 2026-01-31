/**
 * Block Sync
 * Handles blockchain synchronization including chunk sync for large chains
 */

import WebSocket from 'ws';
import { ChunkSyncRequest, ChunkSyncResponse, MessageType, P2PMessage } from '../types.js';
import { Blockchain, Block } from '../../protocol/blockchain/index.js';
import { config } from '../../node/config.js';
import { logger } from '../../protocol/utils/logger.js';
import { processBlockPoolOperations, poolStateManager } from '../../runtime/pool/index.js';
import { storage } from '../../protocol/storage/index.js';
import { getBlockProducer } from '../../runtime/staking/BlockProducer.js';
import { sha256 } from '../../protocol/utils/crypto.js';

export class BlockSync {
    private blockchain: Blockchain;
    private broadcast: (msg: P2PMessage) => void;

    constructor(blockchain: Blockchain, broadcast: (msg: P2PMessage) => void) {
        this.blockchain = blockchain;
        this.broadcast = broadcast;
    }

    // ==================== BLOCKCHAIN RESPONSE ====================

    async handleBlockchainResponse(data: unknown[]): Promise<void> {
        if (!data || data.length === 0) {
            logger.debug('📭 Received empty blockchain response');
            return;
        }

        logger.debug(`📬 Received ${data.length} blocks from peer`);
        const receivedBlocks = data.map(b => Block.fromJSON(b as any));
        const latestReceived = receivedBlocks[receivedBlocks.length - 1];
        const latestLocal = this.blockchain.getLatestBlock();

        logger.debug(`📊 Sync check: Local #${latestLocal.index} vs Received #${latestReceived.index}`);

        if (latestReceived.index > latestLocal.index) {
            logger.info(`📦 Received blockchain is ahead. Local: ${latestLocal.index}, Received: ${latestReceived.index}`);

            const gap = latestReceived.index - latestLocal.index;

            if (latestLocal.hash === latestReceived.previousHash) {
                // Can directly append
                // SECURITY: Verify signature before appending
                const validation = await this.blockchain.validateNewBlock(latestReceived);
                if (!validation.valid) {
                    logger.warn(`⛔ Rejected invalid block ${latestReceived.index}: ${validation.error}`);
                    return;
                }

                this.blockchain.chain.push(latestReceived);
                this.blockchain.applyBlockStakingChanges(latestReceived);  // Real-time staking update
                logger.info(`✅ Added new block ${latestReceived.index}`);
                this.blockchain.markAsSynced();  // Synced after adding block
            } else if (gap > config.sync.chunkSize) {
                // Large gap - use chunk sync
                logger.info(`📡 Large gap (${gap} blocks) - using chunk sync`);
                this.broadcast({
                    type: MessageType.QUERY_BLOCKS_FROM,
                    data: { startIndex: latestLocal.index + 1, limit: config.sync.chunkSize } as ChunkSyncRequest,
                });
            } else if (receivedBlocks.length === 1) {
                // Small gap - request all blocks
                this.broadcast({ type: MessageType.QUERY_ALL, data: null });
            } else {
                // Replace entire chain
                // SECURITY: Long Range Attack Protection

                // 1. Check Finality: Cannot revert finalized blocks
                const finalizedBlock = this.blockchain.getLastFinalizedBlock();
                if (finalizedBlock) {
                    const receivedMatch = receivedBlocks[finalizedBlock.index];
                    if (!receivedMatch || receivedMatch.hash !== finalizedBlock.hash) {
                        logger.warn(`⛔ SECURITY: Detected Deep Reorg attempt! Peer tried to rewrite finalized block #${finalizedBlock.index}`);
                        return; // Reject chain
                    }
                }

                // 2. Verify signatures via STATEFUL REPLAY (Decentralized Check)
                // This ensures validators were valid AT THE TIME they signed the blocks.
                // It replays the history in a sandbox without relying on current state.
                const isValid = await this.blockchain.verifyIncomingChain(receivedBlocks);
                if (!isValid) {
                    logger.warn(`⛔ REJECTED: Chain failed stateful cryptographic verification`);
                    return;
                }

                if (this.blockchain.replaceChain(receivedBlocks)) {
                    logger.info('✅ Chain replaced successfully');
                    this.blockchain.markAsSynced();
                }
            }
        } else {
            // Already synced - local is at or ahead of network
            this.blockchain.markAsSynced();
        }
    }

    // ==================== CHUNK SYNC ====================

    handleQueryBlocksFrom(socket: WebSocket, request: ChunkSyncRequest, send: (msg: P2PMessage) => void): void {
        const { startIndex, limit } = request;
        const maxLimit = Math.min(limit || config.sync.chunkSize, config.sync.maxBlocksPerRequest);

        const totalBlocks = this.blockchain.chain.length;
        const endIndex = Math.min(startIndex + maxLimit, totalBlocks);
        const blocks = this.blockchain.chain.slice(startIndex, endIndex).map(b => b.toJSON());

        const response: ChunkSyncResponse = {
            blocks,
            hasMore: endIndex < totalBlocks,
            totalBlocks,
        };

        logger.debug(`📤 Sending ${blocks.length} blocks (${startIndex}-${endIndex - 1}) to peer`);
        send({ type: MessageType.RESPONSE_BLOCKS, data: response });
    }

    async handleResponseBlocks(response: ChunkSyncResponse): Promise<void> {
        const { blocks, hasMore, totalBlocks } = response;

        if (!blocks || blocks.length === 0) {
            logger.debug('📭 Received empty chunk');
            return;
        }

        logger.info(`📬 Received chunk: ${blocks.length} blocks, hasMore: ${hasMore}, total: ${totalBlocks}`);

        // Try to add blocks one by one
        for (const blockData of blocks) {
            try {
                const block = Block.fromJSON(blockData as any);
                const latestLocal = this.blockchain.getLatestBlock();

                if (block.index === latestLocal.index + 1 && block.previousHash === latestLocal.hash) {
                    // SECURITY: Verify block before accepting
                    const validation = await this.blockchain.validateNewBlock(block);
                    if (!validation.valid) {
                        logger.warn(`⛔ Sync stopped: Invalid block ${block.index}: ${validation.error}`);
                        break;
                    }

                    this.blockchain.chain.push(block);
                    // Update staking interactions for sync
                    this.blockchain.applyBlockStakingChanges(block);
                }
            } catch {
                // Invalid block structure, skip
            }
        }

        // Request more if available
        if (hasMore) {
            const nextStart = this.blockchain.chain.length;
            logger.debug(`📡 Requesting next chunk from index ${nextStart}`);
            this.broadcast({
                type: MessageType.QUERY_BLOCKS_FROM,
                data: { startIndex: nextStart, limit: config.sync.chunkSize } as ChunkSyncRequest,
            });
        } else {
            logger.info(`✅ Chunk sync complete: ${this.blockchain.chain.length} blocks`);
        }
    }

    // ==================== NEW BLOCK ====================

    async handleNewBlock(data: unknown): Promise<void> {
        try {
            const block = Block.fromJSON(data as any);
            const latestLocal = this.blockchain.getLatestBlock();

            if (block.previousHash === latestLocal.hash && block.index === latestLocal.index + 1) {
                // SECURITY: Validate block cryptographically before accepting
                const validation = await this.blockchain.validateNewBlock(block);
                if (!validation.valid) {
                    logger.warn(`⛔ Rejected invalid block ${block.index} from peer: ${validation.error}`);
                    return;
                }

                this.blockchain.chain.push(block);

                // CRITICAL: Apply staking changes from this block in real-time!
                // Without this, validator status doesn't update on receiving nodes
                this.blockchain.applyBlockStakingChanges(block);

                logger.info(`+ Received and added block ${block.index}`);

                // Notify block producer for liveness tracking
                const blockProducer = getBlockProducer();
                if (blockProducer && (block as any).slotNumber && block.validator) {
                    const signature = sha256(block.hash + block.validator + (block as any).slotNumber.toString());
                    blockProducer.markBlockReceived((block as any).slotNumber, block.validator, signature);
                }

                // Process pool operations in this block
                if (block.transactions && block.transactions.length > 0) {
                    const poolOpsProcessed = processBlockPoolOperations(block.transactions, block.index);
                    if (poolOpsProcessed > 0) {
                        logger.info(`🏊 Processed ${poolOpsProcessed} pool operations in block ${block.index}`);
                    }
                }
            } else if (block.index > latestLocal.index + 1) {
                // We're behind, request sync
                this.broadcast({ type: MessageType.QUERY_LATEST, data: null });
            }
        } catch (error) {
            logger.error('Failed to process new block:', error);
        }
    }

    // Load pool state on construction
    private loadPoolState(): void {
        const poolData = storage.loadPool();
        if (poolData) {
            poolStateManager.loadState(poolData);
        }
    }
}

