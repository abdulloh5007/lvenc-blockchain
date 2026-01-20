/**
 * Faucet API Routes (Testnet Only)
 * Request test USDT for swap testing
 */

import { Router, Request, Response } from 'express';
import { usdtBalanceManager } from '../../pool/index.js';
import { config } from '../../config.js';

export function createFaucetRoutes(): Router {
    const router = Router();

    /**
     * POST /api/faucet/usdt
     * Request test USDT from faucet
     */
    router.post('/usdt', (req: Request, res: Response) => {
        if (!config.isTestnet) {
            res.status(403).json({
                success: false,
                error: 'Faucet is only available on testnet',
            });
            return;
        }

        const { address } = req.body;

        if (!address) {
            res.status(400).json({
                success: false,
                error: 'Address is required',
            });
            return;
        }

        const result = usdtBalanceManager.requestFromFaucet(address);

        if (result.success) {
            res.json({
                success: true,
                data: {
                    amount: result.amount,
                    balance: result.balance,
                    address,
                },
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error,
                balance: result.balance,
            });
        }
    });

    /**
     * GET /api/faucet/balance/:address
     * Check USDT balance
     */
    router.get('/balance/:address', (req: Request, res: Response) => {
        const balance = usdtBalanceManager.getBalance(req.params.address);

        res.json({
            success: true,
            data: {
                address: req.params.address,
                balance,
                token: 'USDT',
            },
        });
    });

    /**
     * GET /api/faucet/info
     * Faucet configuration info
     */
    router.get('/info', (_req: Request, res: Response) => {
        const info = usdtBalanceManager.getFaucetInfo();

        res.json({
            success: true,
            data: {
                enabled: info.enabled,
                network: config.network_mode,
                token: 'USDT',
                amount: info.amount,
                cooldownSeconds: info.cooldownMs / 1000,
                maxBalance: info.maxBalance,
            },
        });
    });

    return router;
}
