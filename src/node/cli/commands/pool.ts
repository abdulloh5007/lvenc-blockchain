/**
 * Pool CLI Commands
 * Liquidity pool operations
 */

import { Command } from 'commander';
import { poolStateManager, initializePoolFromAllocation, getLiquidityStatus, INITIAL_LVE_LIQUIDITY, INITIAL_USDT_LIQUIDITY } from '../../../runtime/pool/index.js';
import { storage } from '../../../protocol/storage/index.js';
import cli, { sym, c } from '../../../protocol/utils/cli.js';

export const poolCommand = new Command('pool')
    .description('Liquidity pool operations');

// INIT command
poolCommand
    .command('init')
    .description('Initialize pool from LIQUIDITY allocation')
    .requiredOption('--address <address>', 'Provider wallet address')
    .option('--lve <number>', 'Custom LVE amount', parseFloat)
    .option('--usdt <number>', 'Custom USDT amount', parseFloat)
    .option('--force', 'Force reinitialize (dangerous!)')
    .action(async (options) => {
        const poolData = storage.loadPool();
        if (poolData) poolStateManager.loadState(poolData);

        if (poolStateManager.isInitialized() && !options.force) {
            console.log('');
            console.log(cli.warningBox(
                `Use ${c.primary('lve-chain pool info')} to view status`,
                `${sym.warning_emoji} Pool Already Initialized`
            ));
            console.log('');
            process.exit(0);
        }

        try {
            const lveAmount = options.lve || INITIAL_LVE_LIQUIDITY;
            const usdtAmount = options.usdt || INITIAL_USDT_LIQUIDITY;
            const startPrice = (usdtAmount / lveAmount).toFixed(2);

            console.log('');
            console.log(`${sym.rocket} ${c.bold('Initializing Pool...')}`);
            console.log(`   ${c.label('Provider:')} ${c.value(options.address.slice(0, 24))}...`);
            console.log(`   ${c.label('LVE:')}      ${c.value(lveAmount.toLocaleString())}`);
            console.log(`   ${c.label('USDT:')}     ${c.value(usdtAmount.toLocaleString())}`);
            console.log(`   ${c.label('Price:')}    ${c.value(`1 LVE = ${startPrice} USDT`)}`);
            console.log('');

            const result = initializePoolFromAllocation(options.address, 0, lveAmount, usdtAmount);
            storage.savePool(poolStateManager.getState());

            console.log(cli.successBox([
                `${c.label('LP Tokens:')}   ${c.value(result.lpTokens.toLocaleString())}`,
                `${c.label('Start Price:')} ${c.value(`1 LVE = ${result.startPrice} USDT`)}`,
            ].join('\n'), `${sym.check} Pool Initialized`));
            console.log('');
            process.exit(0);
        } catch (error) {
            cli.error(`Init failed: ${error instanceof Error ? error.message : 'Unknown'}`);
            process.exit(1);
        }
    });

// STATUS command
poolCommand
    .command('status')
    .description('Show LIQUIDITY allocation status')
    .action(async () => {
        try {
            const status = getLiquidityStatus();

            console.log('');
            console.log(cli.infoBox([
                `${c.label('Total Allocation:')} ${c.value(status.totalAllocation.toLocaleString())} LVE`,
                `${c.label('Released:')}         ${c.value(status.released.toLocaleString())} LVE`,
                `${c.label('Locked:')}           ${c.value(status.locked.toLocaleString())} LVE`,
                `${c.label('In Pool:')}          ${c.value(status.inPool.toLocaleString())} LVE`,
                `${c.label('Burned:')}           ${c.value(status.burned.toLocaleString())} LVE`,
            ].join('\n'), `${sym.gem} LIQUIDITY Status`));
            console.log('');
            process.exit(0);
        } catch (error) {
            cli.error(`Status failed: ${error instanceof Error ? error.message : 'Unknown'}`);
            process.exit(1);
        }
    });

// INFO command
poolCommand
    .command('info')
    .description('Show liquidity pool information')
    .action(async () => {
        const poolData = storage.loadPool();
        if (poolData) poolStateManager.loadState(poolData);

        const info = poolStateManager.getPoolInfo();

        if (!info.initialized) {
            console.log('');
            console.log(cli.warningBox(
                `Use ${c.primary('lve-chain pool init')} to create the pool`,
                `${sym.warning_emoji} Pool Not Initialized`
            ));
            console.log('');
            process.exit(0);
        }

        console.log('');
        console.log(cli.infoBox([
            `${c.label('Reserve LVE:')}  ${c.value(info.reserveLVE.toFixed(4))}`,
            `${c.label('Reserve USDT:')} ${c.value(info.reserveUSDT.toFixed(4))}`,
            `${c.label('Price LVE:')}    ${c.value(info.priceLVE.toFixed(6))} USDT`,
            `${c.label('Price USDT:')}   ${c.value(info.priceUSDT.toFixed(6))} LVE`,
            `${c.label('Total LP:')}     ${c.value(info.totalLPTokens.toFixed(4))}`,
            `${c.label('Providers:')}    ${c.value(info.lpProviders.toString())}`,
        ].join('\n'), `${sym.gem} Liquidity Pool`));
        console.log('');
        process.exit(0);
    });

// QUOTE command
poolCommand
    .command('quote')
    .description('Get swap quote')
    .requiredOption('--from <token>', 'Token to swap from (LVE or USDT)')
    .requiredOption('--amount <number>', 'Amount to swap', parseFloat)
    .action(async (options) => {
        const poolData = storage.loadPool();
        if (poolData) poolStateManager.loadState(poolData);

        const info = poolStateManager.getPoolInfo();
        if (!info.initialized) {
            console.log('');
            cli.warn('Pool not initialized');
            console.log('');
            process.exit(0);
        }

        try {
            const quote = poolStateManager.getSwapQuote(options.from.toUpperCase(), options.amount);
            const tokenOut = options.from.toUpperCase() === 'LVE' ? 'USDT' : 'LVE';

            console.log('');
            console.log(cli.infoBox([
                `${c.label('From:')}         ${c.value(`${options.amount} ${options.from.toUpperCase()}`)}`,
                `${c.label('To:')}           ${c.success(`${quote.amountOut.toFixed(6)} ${tokenOut}`)}`,
                `${c.label('Fee:')}          ${c.dim(`${quote.fee.toFixed(6)} ${options.from.toUpperCase()}`)}`,
                `${c.label('Price Impact:')} ${quote.priceImpact > 1 ? c.warning(`${quote.priceImpact.toFixed(2)}%`) : c.value(`${quote.priceImpact.toFixed(2)}%`)}`,
            ].join('\n'), `${sym.lightning} Swap Quote`));
            console.log('');
            process.exit(0);
        } catch (error) {
            cli.error(`Quote failed: ${error instanceof Error ? error.message : 'Unknown'}`);
            process.exit(1);
        }
    });

// ADD command
poolCommand
    .command('add')
    .description('Add liquidity to pool')
    .requiredOption('--address <address>', 'Your wallet address')
    .requiredOption('--lve <number>', 'Amount of LVE to add', parseFloat)
    .requiredOption('--usdt <number>', 'Amount of USDT to add', parseFloat)
    .action(async (options) => {
        const poolData = storage.loadPool();
        if (poolData) poolStateManager.loadState(poolData);

        try {
            const result = poolStateManager.addLiquidity(options.address, options.lve, options.usdt, 0);
            storage.savePool(poolStateManager.getState());

            console.log('');
            console.log(cli.successBox([
                `${c.label('Added:')} ${c.value(`${options.lve} LVE + ${options.usdt} USDT`)}`,
                `${c.label('LP:')}    ${c.success(`${result.lpTokens.toFixed(4)} tokens`)}`,
            ].join('\n'), `${sym.check} Liquidity Added`));
            console.log('');
            process.exit(0);
        } catch (error) {
            cli.error(`Add liquidity failed: ${error instanceof Error ? error.message : 'Unknown'}`);
            process.exit(1);
        }
    });

// REMOVE command
poolCommand
    .command('remove')
    .description('Remove liquidity from pool')
    .requiredOption('--address <address>', 'Your wallet address')
    .requiredOption('--lp <number>', 'Amount of LP tokens to burn', parseFloat)
    .action(async (options) => {
        const poolData = storage.loadPool();
        if (poolData) poolStateManager.loadState(poolData);

        try {
            const result = poolStateManager.removeLiquidity(options.address, options.lp, 0);
            storage.savePool(poolStateManager.getState());

            console.log('');
            console.log(cli.successBox([
                `${c.label('Burned:')} ${c.value(`${options.lp} LP tokens`)}`,
                `${c.label('Got:')}    ${c.success(`${result.lveAmount.toFixed(6)} LVE`)}`,
                `${c.label('Got:')}    ${c.success(`${result.usdtAmount.toFixed(6)} USDT`)}`,
            ].join('\n'), `${sym.check} Liquidity Removed`));
            console.log('');
            process.exit(0);
        } catch (error) {
            cli.error(`Remove failed: ${error instanceof Error ? error.message : 'Unknown'}`);
            process.exit(1);
        }
    });

// SWAP command
poolCommand
    .command('swap')
    .description('Execute a swap')
    .requiredOption('--from <token>', 'Token to swap from (LVE or USDT)')
    .requiredOption('--amount <number>', 'Amount to swap', parseFloat)
    .requiredOption('--min-out <number>', 'Minimum amount out', parseFloat)
    .action(async (options) => {
        const poolData = storage.loadPool();
        if (poolData) poolStateManager.loadState(poolData);

        try {
            const result = poolStateManager.swap(options.from.toUpperCase(), options.amount, options.minOut, 0);
            storage.savePool(poolStateManager.getState());

            const tokenOut = options.from.toUpperCase() === 'LVE' ? 'USDT' : 'LVE';

            console.log('');
            console.log(cli.successBox([
                `${c.label('In:')}  ${c.value(`${options.amount} ${options.from.toUpperCase()}`)}`,
                `${c.label('Out:')} ${c.success(`${result.amountOut.toFixed(6)} ${tokenOut}`)}`,
                `${c.label('Fee:')} ${c.dim(`${result.fee.toFixed(6)} ${options.from.toUpperCase()}`)}`,
            ].join('\n'), `${sym.lightning} Swap Successful`));
            console.log('');
            process.exit(0);
        } catch (error) {
            cli.error(error instanceof Error ? error.message : 'Unknown error');
            process.exit(1);
        }
    });
