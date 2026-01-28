/**
 * Pool API Routes
 * 
 * CONSTRAINTS:
 * - Most endpoints are read-only
 * - Init endpoint for testnet bootstrap only
 * Uses PoolStateManager for on-chain synced state
 */

import { Router, Request, Response } from 'express';
import { poolStateManager, initializePoolFromAllocation, getLiquidityStatus, INITIAL_LVE_LIQUIDITY, INITIAL_USDT_LIQUIDITY } from '../../../runtime/pool/index.js';
import { storage } from '../../../protocol/storage/index.js';

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

            const { address, lve, usdt } = req.body;

            if (!address) {
                res.status(400).json({
                    success: false,
                    error: 'Provider address required',
                });
                return;
            }

            const lveAmount = lve || INITIAL_LVE_LIQUIDITY;
            const usdtAmount = usdt || INITIAL_USDT_LIQUIDITY;
            const blockIndex = 0; // Genesis

            const result = initializePoolFromAllocation(address, blockIndex, lveAmount, usdtAmount);

            // Save pool state
            storage.savePool(poolStateManager.getState());

            res.json({
                success: true,
                data: {
                    lpTokens: result.lpTokens,
                    startPrice: result.startPrice,
                    lveAmount,
                    usdtAmount,
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
                    usdt: info.reserveUSDT,
                },
                price: {
                    lvePerUsdt: info.priceUSDT,
                    usdtPerEdu: info.priceLVE,
                },
                tvl: {
                    lve: info.reserveLVE,
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
                error: 'Required query params: from (LVE|USDT), amount (number)',
            });
            return;
        }

        const token = String(from).toUpperCase() as 'LVE' | 'USDT';
        if (token !== 'LVE' && token !== 'USDT') {
            res.status(400).json({
                success: false,
                error: 'Invalid token. Use LVE or USDT',
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
            const tokenOut = token === 'LVE' ? 'USDT' : 'LVE';

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

    /**
     * POST /api/pool/swap
     * Execute swap with signature verification
     */
    router.post('/swap', async (req: Request, res: Response) => {
        const { from, tokenIn, amountIn, minAmountOut, signature, publicKey, nonce, chainId, signatureScheme } = req.body;

        // Validate required fields
        if (!from || !tokenIn || !amountIn || !signature || !publicKey) {
            res.status(400).json({
                success: false,
                error: 'Required: from, tokenIn, amountIn, signature, publicKey',
            });
            return;
        }

        const token = String(tokenIn).toUpperCase() as 'LVE' | 'USDT';
        if (token !== 'LVE' && token !== 'USDT') {
            res.status(400).json({
                success: false,
                error: 'Invalid tokenIn. Use LVE or USDT',
            });
            return;
        }

        const amount = parseFloat(String(amountIn));
        if (isNaN(amount) || amount <= 0) {
            res.status(400).json({
                success: false,
                error: 'amountIn must be a positive number',
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

        // Verify ed25519 signature
        try {
            const ed = await import('@noble/ed25519');
            const { sha256 } = await import('@noble/hashes/sha256');
            const { bytesToHex } = await import('@noble/hashes/utils');

            // Canonical payload for SWAP transaction
            const tokenOut = token === 'LVE' ? 'USDT' : 'LVE';
            const canonicalPayload =
                (chainId || 'lvenc-testnet') +
                'SWAP' +
                from +
                token +
                tokenOut +
                amount.toString() +
                (minAmountOut || 0).toString();
            const txHash = bytesToHex(sha256(canonicalPayload));

            // Verify signature
            const signatureBytes = Buffer.from(signature, 'hex');
            const publicKeyBytes = Buffer.from(publicKey, 'hex');
            const hashBytes = Buffer.from(txHash, 'hex');

            const isValid = await ed.verifyAsync(signatureBytes, hashBytes, publicKeyBytes);
            if (!isValid) {
                res.status(403).json({ success: false, error: 'Invalid signature' });
                return;
            }

            // Verify publicKey matches from address
            const { chainParams } = await import('../../../protocol/params/chain.js');
            const addressHash = bytesToHex(sha256(publicKey)).substring(0, 40);
            const expectedAddress = chainParams.addressPrefix + addressHash;
            if (expectedAddress !== from) {
                res.status(403).json({ success: false, error: 'Public key does not match address' });
                return;
            }
        } catch (err) {
            res.status(400).json({ success: false, error: 'Signature verification failed' });
            return;
        }

        // Execute swap
        try {
            const minOut = parseFloat(String(minAmountOut || 0));
            const blockIndex = poolStateManager.getPoolInfo().lastUpdateBlock + 1;

            const result = poolStateManager.swap(token, amount, minOut, blockIndex);

            // Save updated pool state
            storage.savePool(poolStateManager.getState());

            const tokenOut = token === 'LVE' ? 'USDT' : 'LVE';
            res.json({
                success: true,
                data: {
                    from,
                    tokenIn: token,
                    tokenOut,
                    amountIn: amount,
                    amountOut: result.amountOut,
                    fee: result.fee,
                    transactionId: `swap-${Date.now()}`,
                },
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: error instanceof Error ? error.message : 'Swap failed',
            });
        }
    });

    return router;
}
