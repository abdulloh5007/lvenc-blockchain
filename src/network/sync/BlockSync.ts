/**
 * Block Sync
 * Handles blockchain synchronization including chunk sync for large chains
 */

import WebSocket from 'ws';
import { ChunkSyncRequest, ChunkSyncResponse, MessageType, P2PMessage } from '../types.js';
import { Blockchain, Block } from '../../blockchain/index.js';
import { config } from '../../config.js';
import { logger } from '../../utils/logger.js';
import { processBlockPoolOperations, poolStateManager } from '../../pool/index.js';
import { storage } from '../../storage/index.js';

export class BlockSync {
    private blockchain: Blockchain;
    private broadcast: (msg: P2PMessage) => void;

    constructor(blockchain: Blockchain, broadcast: (msg: P2PMessage) => void) {
        this.blockchain = blockchain;
        this.broadcast = broadcast;
    }

    // ==================== BLOCKCHAIN RESPONSE ====================

    handleBlockchainResponse(data: unknown[]): void {
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
                this.blockchain.chain.push(latestReceived);
                logger.info(`✅ Added new block ${latestReceived.index}`);
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
                this.blockchain.replaceChain(receivedBlocks);
            }
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

    handleResponseBlocks(response: ChunkSyncResponse): void {
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
                    this.blockchain.chain.push(block);
                }
            } catch {
                // Invalid block, skip
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

    handleNewBlock(data: unknown): void {
        try {
            const block = Block.fromJSON(data as any);
            const latestLocal = this.blockchain.getLatestBlock();

            if (block.previousHash === latestLocal.hash && block.index === latestLocal.index + 1) {
                this.blockchain.chain.push(block);
                logger.info(`🆕 Received and added block ${block.index}`);

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

