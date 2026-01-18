/**
 * Pool API Routes (Read-Only)
 * 
 * CONSTRAINTS:
 * - Only GET endpoints (no state mutation via API)
 * - All write operations must go through transactions
 */

import { Router, Request, Response } from 'express';
import { liquidityPool } from '../../pool/index.js';
import { storage } from '../../storage/index.js';

export function createPoolRoutes(): Router {
    const router = Router();

    // Load pool state on startup
    const poolData = storage.loadPool();
    if (poolData) {
        liquidityPool.loadFromData(poolData);
    }

    /**
     * GET /api/pool/info
     * Get pool information (reserves, price, TVL)
     */
    router.get('/info', (_req: Request, res: Response) => {
        const info = liquidityPool.getPoolInfo();

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
                    // Total value locked in USDT equivalent
                    totalUSDT: info.reserveUSDT * 2, // Both sides equal value
                },
                lp: {
                    totalTokens: info.totalLPTokens,
                    providers: info.lpProviders,
                },
                timestamps: {
                    createdAt: info.createdAt,
                    lastSwapAt: info.lastSwapAt,
                },
            },
        });
    });

    /**
     * GET /api/pool/quote
     * Get swap quote without executing
     * Query params: from (EDU|USDT), amount (number)
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

        if (!liquidityPool.isInitialized()) {
            res.status(400).json({
                success: false,
                error: 'Pool not initialized',
            });
            return;
        }

        try {
            const quote = liquidityPool.getSwapQuote(token, amountNum);
            const tokenOut = token === 'EDU' ? 'USDT' : 'EDU';

            res.json({
                success: true,
                data: {
                    tokenIn: token,
                    tokenOut,
                    amountIn: quote.amountIn,
                    amountOut: quote.amountOut,
                    fee: quote.fee,
                    feePercent: 0.3,
                    priceImpact: quote.priceImpact,
                    executionPrice: quote.amountOut / quote.amountIn,
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

        const balance = liquidityPool.getLPBalance(address);
        const totalLP = liquidityPool.getTotalLPTokens();
        const sharePercent = totalLP > 0 ? (balance / totalLP) * 100 : 0;

        res.json({
            success: true,
            data: {
                address,
                lpBalance: balance,
                totalLPTokens: totalLP,
                sharePercent,
            },
        });
    });

    return router;
}
