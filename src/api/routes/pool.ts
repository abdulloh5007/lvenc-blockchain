/**
 * Pool API Routes (Read-Only)
 * 
 * CONSTRAINTS:
 * - Only GET endpoints (no state mutation via API)
 * - All write operations must go through transactions
 * Uses PoolStateManager for on-chain synced state
 */

import { Router, Request, Response } from 'express';
import { poolStateManager } from '../../pool/index.js';
import { storage } from '../../storage/index.js';

export function createPoolRoutes(): Router {
    const router = Router();

    // Load pool state on startup
    const poolData = storage.loadPool();
    poolStateManager.loadState(poolData);

    /**
     * GET /api/pool/info
     * Get pool information (reserves, price, TVL)
     */
    router.get('/info', (_req: Request, res: Response) => {
        // Reload from storage to get latest state
        const poolData = storage.loadPool();
        poolStateManager.loadState(poolData);

        const info = poolStateManager.getPoolInfo();

        res.json({
            success: true,
            data: {
                initialized: info.initialized,
                reserves: {
                    edu: info.reserveEDU,
                    usdt: info.reserveUSDT,
                },
                price: {
                    eduPerUsdt: info.priceUSDT,
                    usdtPerEdu: info.priceEDU,
                },
                tvl: {
                    edu: info.reserveEDU,
                    usdt: info.reserveUSDT,
                    totalUSDT: info.reserveUSDT * 2,
                },
                lp: {
                    totalTokens: info.totalLPTokens,
                    providers: info.lpProviders,
                },
                blocks: {
                    createdAt: info.createdAtBlock,
                    lastUpdate: info.lastUpdateBlock,
                },
            },
        });
    });

    /**
     * GET /api/pool/quote
     * Get swap quote without executing
     */
    router.get('/quote', (req: Request, res: Response) => {
        const { from, amount } = req.query;

        if (!from || !amount) {
            res.status(400).json({
                success: false,
                error: 'Required query params: from (EDU|USDT), amount (number)',
            });
            return;
        }

        const token = String(from).toUpperCase() as 'EDU' | 'USDT';
        if (token !== 'EDU' && token !== 'USDT') {
            res.status(400).json({
                success: false,
                error: 'Invalid token. Use EDU or USDT',
            });
            return;
        }

        const amountNum = parseFloat(String(amount));
        if (isNaN(amountNum) || amountNum <= 0) {
            res.status(400).json({
                success: false,
                error: 'Amount must be a positive number',
            });
            return;
        }

        // Reload state
        const poolData = storage.loadPool();
        poolStateManager.loadState(poolData);

        if (!poolStateManager.isInitialized()) {
            res.status(400).json({
                success: false,
                error: 'Pool not initialized',
            });
            return;
        }

        try {
            const quote = poolStateManager.getSwapQuote(token, amountNum);
            const tokenOut = token === 'EDU' ? 'USDT' : 'EDU';

            res.json({
                success: true,
                data: {
                    tokenIn: token,
                    tokenOut,
                    amountIn: amountNum,
                    amountOut: quote.amountOut,
                    fee: quote.fee,
                    feePercent: 0.3,
                    priceImpact: quote.priceImpact,
                    executionPrice: quote.amountOut / amountNum,
                },
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: error instanceof Error ? error.message : 'Quote failed',
            });
        }
    });

    /**
     * GET /api/pool/lp/:address
     * Get LP token balance for an address
     */
    router.get('/lp/:address', (req: Request, res: Response) => {
        const { address } = req.params;

        // Reload state
        const poolData = storage.loadPool();
        poolStateManager.loadState(poolData);

        const balance = poolStateManager.getLPBalance(address);
        const info = poolStateManager.getPoolInfo();
        const sharePercent = info.totalLPTokens > 0 ? (balance / info.totalLPTokens) * 100 : 0;

        res.json({
            success: true,
            data: {
                address,
                lpBalance: balance,
                totalLPTokens: info.totalLPTokens,
                sharePercent,
            },
        });
    });

    return router;
}
