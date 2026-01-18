/**
 * Pool CLI Command
 * Commands for AMM liquidity pool operations
 * Uses PoolStateManager for on-chain synced pool state
 */

import { Command } from 'commander';
import { poolStateManager } from '../../pool/index.js';
import { storage } from '../../storage/index.js';

export const poolCommand = new Command('pool')
    .description('Liquidity pool operations');

// ========== INFO ==========

poolCommand
    .command('info')
    .description('Show pool information')
    .action(() => {
        // Load pool state
        const poolData = storage.loadPool();
        poolStateManager.loadState(poolData);

        const info = poolStateManager.getPoolInfo();

        if (!info.initialized) {
            console.log(`
╔═══════════════════════════════════════════════════════════╗
║                    💧 Liquidity Pool                      ║
╠═══════════════════════════════════════════════════════════╣
║  Status: NOT INITIALIZED                                  ║
║                                                           ║
║  Use 'edu-chain pool add' to create the pool              ║
╚═══════════════════════════════════════════════════════════╝
            `);
            return;
        }

        console.log(`
╔═══════════════════════════════════════════════════════════╗
║                    💧 Liquidity Pool                      ║
╠═══════════════════════════════════════════════════════════╣
║  Reserve EDU:    ${info.reserveEDU.toFixed(4).padEnd(38)} ║
║  Reserve USDT:   ${info.reserveUSDT.toFixed(4).padEnd(38)} ║
║  Price (EDU):    ${info.priceEDU.toFixed(6).padEnd(38)} USDT║
║  Total LP:       ${info.totalLPTokens.toFixed(4).padEnd(38)} ║
║  LP Providers:   ${String(info.lpProviders).padEnd(38)} ║
╚═══════════════════════════════════════════════════════════╝
        `);
    });

// ========== QUOTE ==========

poolCommand
    .command('quote')
    .description('Get swap quote without executing')
    .requiredOption('--from <token>', 'Token to swap from (EDU or USDT)')
    .requiredOption('--amount <number>', 'Amount to swap')
    .action((options) => {
        const poolData = storage.loadPool();
        poolStateManager.loadState(poolData);

        if (!poolStateManager.isInitialized()) {
            console.log('❌ Pool not initialized');
            process.exit(1);
        }

        const token = options.from.toUpperCase() as 'EDU' | 'USDT';
        if (token !== 'EDU' && token !== 'USDT') {
            console.log('❌ Invalid token. Use EDU or USDT');
            process.exit(1);
        }

        const amount = parseFloat(options.amount);
        if (isNaN(amount) || amount <= 0) {
            console.log('❌ Invalid amount');
            process.exit(1);
        }

        try {
            const quote = poolStateManager.getSwapQuote(token, amount);
            const tokenOut = token === 'EDU' ? 'USDT' : 'EDU';

            console.log(`
╔═══════════════════════════════════════════════════════════╗
║                    💱 Swap Quote                          ║
╠═══════════════════════════════════════════════════════════╣
║  Input:          ${amount.toFixed(4)} ${token.padEnd(33)} ║
║  Output:         ${quote.amountOut.toFixed(4)} ${tokenOut.padEnd(33)} ║
║  Fee (0.3%):     ${quote.fee.toFixed(4)} ${token.padEnd(33)} ║
║  Price Impact:   ${quote.priceImpact.toFixed(2)}%${' '.repeat(33)} ║
╚═══════════════════════════════════════════════════════════╝
            `);
        } catch (error) {
            console.log(`❌ ${error instanceof Error ? error.message : 'Quote failed'}`);
            process.exit(1);
        }
    });

// ========== ADD LIQUIDITY ==========

poolCommand
    .command('add')
    .description('Add liquidity to pool')
    .requiredOption('--address <address>', 'Provider address')
    .requiredOption('--edu <number>', 'EDU amount')
    .requiredOption('--usdt <number>', 'USDT amount')
    .action((options) => {
        const poolData = storage.loadPool();
        poolStateManager.loadState(poolData);

        const eduAmount = parseFloat(options.edu);
        const usdtAmount = parseFloat(options.usdt);

        if (isNaN(eduAmount) || isNaN(usdtAmount) || eduAmount <= 0 || usdtAmount <= 0) {
            console.log('❌ Invalid amounts');
            process.exit(1);
        }

        try {
            // Use block 0 for CLI (will be replaced with actual block in block producer)
            const blockIndex = 0;
            const result = poolStateManager.addLiquidity(options.address, eduAmount, usdtAmount, blockIndex);
            storage.savePool(poolStateManager.getState());

            console.log(`
╔═══════════════════════════════════════════════════════════╗
║                 ✅ Liquidity Added                        ║
╠═══════════════════════════════════════════════════════════╣
║  EDU Added:      ${eduAmount.toFixed(4).padEnd(38)} ║
║  USDT Added:     ${usdtAmount.toFixed(4).padEnd(38)} ║
║  LP Tokens:      ${result.lpTokens.toFixed(4).padEnd(38)} ║
╚═══════════════════════════════════════════════════════════╝
            `);
        } catch (error) {
            console.log(`❌ ${error instanceof Error ? error.message : 'Add liquidity failed'}`);
            process.exit(1);
        }
    });

// ========== REMOVE LIQUIDITY ==========

poolCommand
    .command('remove')
    .description('Remove liquidity from pool')
    .requiredOption('--address <address>', 'Provider address')
    .requiredOption('--lp <number>', 'LP tokens to burn')
    .action((options) => {
        const poolData = storage.loadPool();
        poolStateManager.loadState(poolData);

        const lpTokens = parseFloat(options.lp);
        if (isNaN(lpTokens) || lpTokens <= 0) {
            console.log('❌ Invalid LP amount');
            process.exit(1);
        }

        try {
            const blockIndex = 0;
            const result = poolStateManager.removeLiquidity(options.address, lpTokens, blockIndex);
            storage.savePool(poolStateManager.getState());

            console.log(`
╔═══════════════════════════════════════════════════════════╗
║                 ✅ Liquidity Removed                      ║
╠═══════════════════════════════════════════════════════════╣
║  LP Burned:      ${lpTokens.toFixed(4).padEnd(38)} ║
║  EDU Received:   ${result.eduAmount.toFixed(4).padEnd(38)} ║
║  USDT Received:  ${result.usdtAmount.toFixed(4).padEnd(38)} ║
╚═══════════════════════════════════════════════════════════╝
            `);
        } catch (error) {
            console.log(`❌ ${error instanceof Error ? error.message : 'Remove liquidity failed'}`);
            process.exit(1);
        }
    });

// ========== SWAP ==========

poolCommand
    .command('swap')
    .description('Swap tokens')
    .requiredOption('--from <token>', 'Token to swap from (EDU or USDT)')
    .requiredOption('--amount <number>', 'Amount to swap')
    .option('--min-out <number>', 'Minimum output (slippage protection)', '0')
    .action((options) => {
        const poolData = storage.loadPool();
        poolStateManager.loadState(poolData);

        if (!poolStateManager.isInitialized()) {
            console.log('❌ Pool not initialized');
            process.exit(1);
        }

        const token = options.from.toUpperCase() as 'EDU' | 'USDT';
        if (token !== 'EDU' && token !== 'USDT') {
            console.log('❌ Invalid token. Use EDU or USDT');
            process.exit(1);
        }

        const amount = parseFloat(options.amount);
        const minOut = parseFloat(options.minOut);

        if (isNaN(amount) || amount <= 0) {
            console.log('❌ Invalid amount');
            process.exit(1);
        }

        try {
            const blockIndex = 0;
            const result = poolStateManager.swap(token, amount, minOut, blockIndex);
            storage.savePool(poolStateManager.getState());

            const tokenOut = token === 'EDU' ? 'USDT' : 'EDU';

            console.log(`
╔═══════════════════════════════════════════════════════════╗
║                    ✅ Swap Executed                       ║
╠═══════════════════════════════════════════════════════════╣
║  Sold:           ${amount.toFixed(4)} ${token.padEnd(33)} ║
║  Received:       ${result.amountOut.toFixed(4)} ${tokenOut.padEnd(33)} ║
║  Fee:            ${result.fee.toFixed(4)} ${token.padEnd(33)} ║
╚═══════════════════════════════════════════════════════════╝
            `);
        } catch (error) {
            console.log(`❌ ${error instanceof Error ? error.message : 'Swap failed'}`);
            process.exit(1);
        }
    });
