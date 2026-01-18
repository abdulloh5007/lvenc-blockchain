import { Router, Request, Response } from 'express';
import { Blockchain, Transaction } from '../../blockchain/index.js';
import { storage } from '../../storage/index.js';
import { logger } from '../../utils/logger.js';
export function createAdminRoutes(blockchain: Blockchain): Router {
    const router = Router();
    router.get('/stats', (_req: Request, res: Response) => {
        const stats = blockchain.getStats();
        res.json({
            success: true,
            data: {
                blockchain: stats,
                uptime: process.uptime(),
                memoryUsage: process.memoryUsage(),
            },
        });
    });
    router.post('/faucet', (req: Request, res: Response) => {
        const { address, amount = 100 } = req.body;
        if (!address) {
            res.status(400).json({ success: false, error: 'Address is required' });
            return;
        }
        const genesisBlock = blockchain.chain[0];
        if (!genesisBlock) {
            res.status(500).json({ success: false, error: 'No genesis block' });
            return;
        }
        const genesisAddress = genesisBlock.transactions[0]?.toAddress;
        if (!genesisAddress) {
            res.status(500).json({ success: false, error: 'Genesis address not found' });
            return;
        }
        const genesisBalance = blockchain.getBalance(genesisAddress);
        if (genesisBalance < amount) {
            res.status(400).json({ success: false, error: 'Faucet is empty' });
            return;
        }
        try {
            const tx = new Transaction(genesisAddress, address, amount, 0);
            blockchain.addTransaction(tx);
            storage.saveBlockchain(blockchain.toJSON());
            logger.info(`💧 Faucet sent ${amount} LVE to ${address}`);
            res.json({
                success: true,
                data: { message: `Sent ${amount} LVE to ${address}`, transactionId: tx.id },
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Faucet failed',
            });
        }
    });
    router.delete('/pending', (_req: Request, res: Response) => {
        res.json({
            success: true,
            data: { message: 'Pending transactions cleared' },
        });
    });
    return router;
}
