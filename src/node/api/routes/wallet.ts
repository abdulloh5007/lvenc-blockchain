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

    // Batch balance endpoint - get balances for multiple addresses in one request
    // This prevents rate limiting when frontend has many wallets
    router.post('/batch-balances', (req: Request, res: Response) => {
        const { addresses } = req.body;

        if (!Array.isArray(addresses)) {
            res.status(400).json({
                success: false,
                error: 'addresses must be an array'
            });
            return;
        }

        if (addresses.length > 50) {
            res.status(400).json({
                success: false,
                error: 'Maximum 50 addresses per request'
            });
            return;
        }

        const balances: { address: string; balance: number }[] = [];
        for (const address of addresses) {
            if (typeof address === 'string') {
                balances.push({
                    address,
                    balance: blockchain.getBalance(address)
                });
            }
        }

        res.json({
            success: true,
            data: { balances, symbol: 'LVE' }
        });
    });

    return router;
}
