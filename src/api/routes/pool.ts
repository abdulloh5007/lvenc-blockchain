/**
 * Pool API Routes
 * 
 * CONSTRAINTS:
 * - Most endpoints are read-only
 * - Init endpoint for testnet bootstrap only
 * Uses PoolStateManager for on-chain synced state
 */

import { Router, Request, Response } from 'express';
import { poolStateManager, initializePoolFromAllocation, getLiquidityStatus, INITIAL_LVE_LIQUIDITY, INITIAL_UZS_LIQUIDITY } from '../../pool/index.js';
import { storage } from '../../storage/index.js';

export function createPoolRoutes(): Router {
    const router = Router();

    // Load pool state on startup
    const poolData = storage.loadPool();
    poolStateManager.loadState(poolData);

    /**
     * POST /api/pool/init
     * Initialize pool from LIQUIDITY allocation (testnet bootstrap)
     */
    router.post('/init', (req: Request, res: Response) => {
        try {
            if (poolStateManager.isInitialized()) {
                res.status(400).json({
                    success: false,
                    error: 'Pool already initialized',
                });
                return;
            }

            const { address, lve, uzs } = req.body;

            if (!address) {
                res.status(400).json({
                    success: false,
                    error: 'Provider address required',
                });
                return;
            }

            const lveAmount = lve || INITIAL_LVE_LIQUIDITY;
            const uzsAmount = uzs || INITIAL_UZS_LIQUIDITY;
            const blockIndex = 0; // Genesis

            const result = initializePoolFromAllocation(address, blockIndex, lveAmount, uzsAmount);

            // Save pool state
            storage.savePool(poolStateManager.getState());

            res.json({
                success: true,
                data: {
                    lpTokens: result.lpTokens,
                    startPrice: result.startPrice,
                    lveAmount,
                    uzsAmount,
                    provider: address,
                },
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Init failed',
            });
        }
    });

    /**
     * GET /api/pool/liquidity-status
     * Get LIQUIDITY allocation status
     */
    router.get('/liquidity-status', (_req: Request, res: Response) => {
        try {
            const status = getLiquidityStatus();

            res.json({
                success: true,
                data: {
                    totalAllocation: status.totalAllocation,
                    released: status.released,
                    locked: status.locked,
                    inPool: status.inPool,
                    burned: status.burned,
                    percentReleased: ((status.released / status.totalAllocation) * 100).toFixed(2),
                },
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Status failed',
            });
        }
    });

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
                    lve: info.reserveLVE,
                    uzs: info.reserveUZS,
                },
                price: {
                    lvePerUsdt: info.priceUZS,
                    uzsPerEdu: info.priceLVE,
                },
                tvl: {
                    lve: info.reserveLVE,
                    uzs: info.reserveUZS,
                    totalUZS: info.reserveUZS * 2,
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
                error: 'Required query params: from (LVE|UZS), amount (number)',
            });
            return;
        }

        const token = String(from).toUpperCase() as 'LVE' | 'UZS';
        if (token !== 'LVE' && token !== 'UZS') {
            res.status(400).json({
                success: false,
                error: 'Invalid token. Use LVE or UZS',
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
            const tokenOut = token === 'LVE' ? 'UZS' : 'LVE';

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
