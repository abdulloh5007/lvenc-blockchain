import { Router, Request, Response } from 'express';
import { Blockchain } from '../../../protocol/blockchain/index.js';
export function createWalletRoutes(blockchain: Blockchain): Router {
    const router = Router();
    router.get('/:address/balance', (req: Request, res: Response) => {
        const { address } = req.params;
        const balance = blockchain.getBalance(address);
        res.json({
            success: true,
            data: { address, balance, symbol: 'LVE' },
        });
    });
    router.get('/:address/transactions', (req: Request, res: Response) => {
        const { address } = req.params;
        const transactions = blockchain.getTransactionHistory(address);
        res.json({
            success: true,
            data: {
                address,
                transactions: transactions.map(tx => tx.toJSON()),
                count: transactions.length,
            },
        });
    });
    return router;
}
