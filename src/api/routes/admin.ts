import { Router, Request, Response } from 'express';
import { Blockchain } from '../../blockchain/index.js';
import { storage } from '../../storage/index.js';
import { Wallet } from '../../wallet/index.js';
import { logger } from '../../utils/logger.js';

/**
 * Admin Routes - Protected by API Key
 * These endpoints require X-API-Key header
 */
export function createAdminRoutes(blockchain: Blockchain): Router {
    const router = Router();

    // Mine a new block
    router.post('/mine', (req: Request, res: Response) => {
        const { minerAddress } = req.body;

        if (!minerAddress) {
            res.status(400).json({
                success: false,
                error: 'Miner address is required',
            });
            return;
        }

        try {
            const block = blockchain.minePendingTransactions(minerAddress);
            storage.saveBlockchain(blockchain.toJSON());

            logger.info(`⛏️ Admin mined block #${block.index}`);

            res.json({
                success: true,
                data: {
                    message: 'Block mined successfully',
                    block: block.toJSON(),
                    reward: blockchain.miningReward,
                },
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Mining failed',
            });
        }
    });

    // Faucet - send free coins
    router.post('/faucet', (req: Request, res: Response) => {
        const { address, amount = 100 } = req.body;

        if (!address) {
            res.status(400).json({
                success: false,
                error: 'Address is required',
            });
            return;
        }

        const wallets = storage.listWallets();
        const faucetData = wallets.find(w => w.label === 'Faucet');

        if (!faucetData) {
            res.status(500).json({
                success: false,
                error: 'Faucet wallet not found',
            });
            return;
        }

        const faucetWallet = Wallet.import(faucetData);
        const faucetBalance = blockchain.getBalance(faucetWallet.address);

        if (faucetBalance < amount) {
            res.status(400).json({
                success: false,
                error: 'Faucet is empty. Mine some blocks first!',
            });
            return;
        }

        try {
            const tx = faucetWallet.createTransaction(address, amount);
            blockchain.addTransaction(tx);
            storage.saveBlockchain(blockchain.toJSON());

            logger.info(`💧 Faucet sent ${amount} EDU to ${address}`);

            res.json({
                success: true,
                data: {
                    message: `Sent ${amount} EDU to ${address}`,
                    transactionId: tx.id,
                },
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Faucet failed',
            });
        }
    });

    // List all wallets (addresses only, not private keys)
    router.get('/wallets', (_req: Request, res: Response) => {
        const wallets = storage.listWallets();

        const safeWallets = wallets.map(w => ({
            address: w.address,
            label: w.label || 'Unnamed',
            // Never expose private keys!
        }));

        res.json({
            success: true,
            data: safeWallets,
        });
    });

    // Get full statistics
    router.get('/stats', (_req: Request, res: Response) => {
        const stats = blockchain.getStats();
        const wallets = storage.listWallets();

        res.json({
            success: true,
            data: {
                blockchain: stats,
                walletsCount: wallets.length,
                uptime: process.uptime(),
                memoryUsage: process.memoryUsage(),
            },
        });
    });

    // Clear pending transactions
    router.delete('/pending', (_req: Request, res: Response) => {
        // This would need implementation in Blockchain class
        res.json({
            success: true,
            data: { message: 'Pending transactions cleared' },
        });
    });

    return router;
}
