import { Router, Request, Response } from 'express';
import { Blockchain } from '../../../protocol/blockchain/index.js';

export function createBlockchainRoutes(blockchain: Blockchain): Router {
    const router = Router();

    // Get blockchain info
    router.get('/', (_req: Request, res: Response) => {
        res.json({
            success: true,
            data: blockchain.getStats(),
        });
    });

    // Get full chain
    router.get('/chain', (_req: Request, res: Response) => {
        res.json({
            success: true,
            data: {
                length: blockchain.chain.length,
                chain: blockchain.chain.map(b => b.toJSON()),
            },
        });
    });

    // Get paginated blocks (newest first)
    router.get('/blocks', (req: Request, res: Response) => {
        const offset = parseInt(req.query.offset as string) || 0;
        const limit = parseInt(req.query.limit as string) || 20;

        // Get blocks in reverse order (newest first)
        const totalBlocks = blockchain.chain.length;
        const startIndex = Math.max(0, totalBlocks - offset - limit);
        const endIndex = totalBlocks - offset;

        const blocks = blockchain.chain
            .slice(startIndex, endIndex)
            .reverse()
            .map(b => b.toJSON());

        res.json({
            success: true,
            data: {
                blocks,
                total: totalBlocks,
                offset,
                limit,
                hasMore: startIndex > 0,
            },
        });
    });

    // Get latest block
    router.get('/latest', (_req: Request, res: Response) => {
        res.json({
            success: true,
            data: blockchain.getLatestBlock().toJSON(),
        });
    });

    // Get block by hash
    router.get('/block/:hash', (req: Request, res: Response) => {
        const block = blockchain.getBlockByHash(req.params.hash);
        if (!block) {
            res.status(404).json({
                success: false,
                error: 'Block not found',
            });
            return;
        }
        res.json({
            success: true,
            data: block.toJSON(),
        });
    });

    // Get block by index
    router.get('/block/index/:index', (req: Request, res: Response) => {
        const index = parseInt(req.params.index, 10);
        const block = blockchain.getBlockByIndex(index);
        if (!block) {
            res.status(404).json({
                success: false,
                error: 'Block not found',
            });
            return;
        }
        res.json({
            success: true,
            data: block.toJSON(),
        });
    });

    // Validate chain
    router.get('/validate', (_req: Request, res: Response) => {
        const isValid = blockchain.isChainValid();
        res.json({
            success: true,
            data: {
                valid: isValid,
                blocks: blockchain.chain.length,
            },
        });
    });

    // Get recommended fees (dynamic based on mempool congestion)
    router.get('/fee', (_req: Request, res: Response) => {
        const fees = blockchain.getRecommendedFee();
        res.json({
            success: true,
            data: {
                ...fees,
                pendingTransactions: blockchain.pendingTransactions.length,
                maxPerBlock: 10,
            },
        });
    });

    return router;
}
