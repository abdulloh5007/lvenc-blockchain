import { Router, Request, Response } from 'express';
import { Blockchain } from '../../blockchain/index.js';
import { storage } from '../../storage/index.js';

export function createMiningRoutes(blockchain: Blockchain): Router {
    const router = Router();

    // Mine pending transactions
    router.post('/mine', (req: Request, res: Response) => {
        const { minerAddress } = req.body;

        if (!minerAddress) {
            res.status(400).json({
                success: false,
                error: 'Miner address is required',
            });
            return;
        }

        // Check if there's anything to mine
        if (blockchain.pendingTransactions.length === 0) {
            res.status(400).json({
                success: false,
                error: 'No pending transactions to mine',
            });
            return;
        }

        try {
            const block = blockchain.minePendingTransactions(minerAddress);

            // Save blockchain state
            storage.saveBlockchain(blockchain.toJSON());

            res.json({
                success: true,
                data: {
                    message: 'Block mined successfully!',
                    block: {
                        index: block.index,
                        hash: block.hash,
                        transactions: block.transactions.length,
                        nonce: block.nonce,
                        reward: blockchain.miningReward,
                    },
                },
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Mining failed',
            });
        }
    });

    // Mining info
    router.get('/info', (_req: Request, res: Response) => {
        res.json({
            success: true,
            data: {
                difficulty: blockchain.difficulty,
                reward: blockchain.miningReward,
                pendingTransactions: blockchain.pendingTransactions.length,
                lastBlockHash: blockchain.getLatestBlock().hash,
            },
        });
    });

    return router;
}
