import { Command } from 'commander';
import { poolStateManager, initializePoolFromAllocation, getLiquidityStatus, INITIAL_LVE_LIQUIDITY, INITIAL_UZS_LIQUIDITY } from '../../pool/index.js';
import { storage } from '../../storage/index.js';
import { boxCenter, boxSeparator, boxTop, boxBottom, boxEmpty } from '../../utils/box.js';
import { getNodeIdentity } from '../../identity/NodeIdentity.js';

export const poolCommand = new Command('pool')
    .description('Liquidity pool operations');

// INIT command - Initialize pool from LIQUIDITY allocation
poolCommand
    .command('init')
    .description('Initialize pool from LIQUIDITY allocation (100K LVE + 5M UZS)')
    .requiredOption('--address <address>', 'Provider wallet address')
    .option('--lve <number>', 'Custom LVE amount', parseFloat)
    .option('--uzs <number>', 'Custom UZS amount', parseFloat)
    .option('--force', 'Force reinitialize (dangerous!)')
    .action(async (options) => {
        const poolData = storage.loadPool();
        if (poolData) {
            poolStateManager.loadState(poolData);
        }

        if (poolStateManager.isInitialized() && !options.force) {
            console.log('');
            console.log(boxTop());
            console.log(boxCenter('⚠️  Pool Already Initialized'));
            console.log(boxSeparator());
            console.log(boxCenter(`Use 'lve-chain pool info' to view status`));
            console.log(boxBottom());
            console.log('');
            return;
        }

        try {
            const lveAmount = options.lve || INITIAL_LVE_LIQUIDITY;
            const uzsAmount = options.uzs || INITIAL_UZS_LIQUIDITY;
            const provider = options.address;
            const blockIndex = 0; // Genesis

            console.log('');
            console.log(boxTop());
            console.log(boxCenter('🚀 Initializing Pool from LIQUIDITY Allocation'));
            console.log(boxSeparator());
            console.log(boxCenter(`Provider: ${provider.slice(0, 20)}...`));
            console.log(boxCenter(`LVE:      ${lveAmount.toLocaleString()}`));
            console.log(boxCenter(`UZS:      ${uzsAmount.toLocaleString()}`));
            console.log(boxCenter(`Price:    1 LVE = ${(uzsAmount / lveAmount).toFixed(2)} UZS`));
            console.log(boxSeparator());

            const result = initializePoolFromAllocation(provider, blockIndex, lveAmount, uzsAmount);

            console.log(boxCenter('✅ Pool Initialized Successfully!'));
            console.log(boxEmpty());
            console.log(boxCenter(`LP Tokens: ${result.lpTokens.toLocaleString()}`));
            console.log(boxCenter(`Start Price: 1 LVE = ${result.startPrice} UZS`));
            console.log(boxBottom());
            console.log('');

            // Save pool state
            storage.savePool(poolStateManager.getState());
        } catch (error) {
            console.error(`❌ Init failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    });

// STATUS command - Show liquidity status
poolCommand
    .command('status')
    .description('Show LIQUIDITY allocation status')
    .action(async () => {
        try {
            const status = getLiquidityStatus();

            console.log('');
            console.log(boxTop());
            console.log(boxCenter('📊 LIQUIDITY Allocation Status'));
            console.log(boxSeparator());
            console.log(boxCenter(`Total Allocation: ${status.totalAllocation.toLocaleString()} LVE`));
            console.log(boxCenter(`Released:         ${status.released.toLocaleString()} LVE`));
            console.log(boxCenter(`Locked:           ${status.locked.toLocaleString()} LVE`));
            console.log(boxCenter(`In Pool:          ${status.inPool.toLocaleString()} LVE`));
            console.log(boxCenter(`Burned:           ${status.burned.toLocaleString()} LVE`));
            console.log(boxBottom());
            console.log('');
        } catch (error) {
            console.error(`❌ Status failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    });

// INFO command
poolCommand
    .command('info')
    .description('Show liquidity pool information')
    .action(async () => {
        const poolData = storage.loadPool();
        if (poolData) {
            poolStateManager.loadState(poolData);
        }

        const info = poolStateManager.getPoolInfo();

        if (!info.initialized) {
            console.log('');
            console.log(boxTop());
            console.log(boxCenter('💧 Liquidity Pool'));
            console.log(boxSeparator());
            console.log(boxCenter('Status: NOT INITIALIZED'));
            console.log(boxEmpty());
            console.log(boxCenter("Use 'lve-chain pool add' to create the pool"));
            console.log(boxBottom());
            console.log('');
            return;
        }

        console.log('');
        console.log(boxTop());
        console.log(boxCenter('💧 Liquidity Pool'));
        console.log(boxSeparator());
        console.log(boxCenter(`Reserve LVE:    ${info.reserveLVE.toFixed(4)}`));
        console.log(boxCenter(`Reserve UZS:    ${info.reserveUZS.toFixed(4)}`));
        console.log(boxCenter(`Price (LVE):    ${info.priceLVE.toFixed(6)} UZS`));
        console.log(boxCenter(`Price (UZS):    ${info.priceUZS.toFixed(6)} LVE`));
        console.log(boxCenter(`Total LP:       ${info.totalLPTokens.toFixed(4)}`));
        console.log(boxCenter(`LP Providers:   ${info.lpProviders}`));
        console.log(boxBottom());
        console.log('');
    });

// QUOTE command
poolCommand
    .command('quote')
    .description('Get swap quote')
    .requiredOption('--from <token>', 'Token to swap from (LVE or UZS)')
    .requiredOption('--amount <number>', 'Amount to swap', parseFloat)
    .action(async (options) => {
        const poolData = storage.loadPool();
        if (poolData) {
            poolStateManager.loadState(poolData);
        }

        const info = poolStateManager.getPoolInfo();

        if (!info.initialized) {
            console.log('');
            console.log(boxTop());
            console.log(boxCenter('💧 Liquidity Pool'));
            console.log(boxSeparator());
            console.log(boxCenter('Pool not initialized'));
            console.log(boxEmpty());
            console.log(boxCenter("Use 'lve-chain pool add' first"));
            console.log(boxBottom());
            console.log('');
            return;
        }

        try {
            const quote = poolStateManager.getSwapQuote(options.from.toUpperCase(), options.amount);
            const tokenOut = options.from.toUpperCase() === 'LVE' ? 'UZS' : 'LVE';

            console.log('');
            console.log(boxTop());
            console.log(boxCenter('💱 Swap Quote'));
            console.log(boxSeparator());
            console.log(boxCenter(`From:          ${options.amount} ${options.from.toUpperCase()}`));
            console.log(boxCenter(`To:            ${quote.amountOut.toFixed(6)} ${tokenOut}`));
            console.log(boxCenter(`Fee:           ${quote.fee.toFixed(6)} ${options.from.toUpperCase()}`));
            console.log(boxCenter(`Price Impact:  ${quote.priceImpact.toFixed(2)}%`));
            console.log(boxBottom());
            console.log('');
        } catch (error) {
            console.error(`❌ Quote failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    });

// ADD command
poolCommand
    .command('add')
    .description('Add liquidity to pool')
    .requiredOption('--address <address>', 'Your wallet address')
    .requiredOption('--lve <number>', 'Amount of LVE to add', parseFloat)
    .requiredOption('--uzs <number>', 'Amount of UZS to add', parseFloat)
    .action(async (options) => {
        const poolData = storage.loadPool();
        if (poolData) {
            poolStateManager.loadState(poolData);
        }

        try {
            const result = poolStateManager.addLiquidity(
                options.address,
                options.lve,
                options.uzs,
                0
            );

            storage.savePool(poolStateManager.getState());

            console.log('');
            console.log(boxTop());
            console.log(boxCenter('➕ Liquidity Added'));
            console.log(boxSeparator());
            console.log(boxCenter(`Added:   ${options.lve} LVE + ${options.uzs} UZS`));
            console.log(boxCenter(`LP:      ${result.lpTokens.toFixed(4)} tokens`));
            console.log(boxBottom());
            console.log('');
        } catch (error) {
            console.error(`❌ Add liquidity failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
        if (poolData) {
            poolStateManager.loadState(poolData);
        }

        try {
            const result = poolStateManager.removeLiquidity(
                options.address,
                options.lp,
                0
            );

            storage.savePool(poolStateManager.getState());

            console.log('');
            console.log(boxTop());
            console.log(boxCenter('➖ Liquidity Removed'));
            console.log(boxSeparator());
            console.log(boxCenter(`Burned:  ${options.lp} LP tokens`));
            console.log(boxCenter(`Got:     ${result.lveAmount.toFixed(6)} LVE`));
            console.log(boxCenter(`Got:     ${result.uzsAmount.toFixed(6)} UZS`));
            console.log(boxBottom());
            console.log('');
        } catch (error) {
            console.error(`❌ Remove liquidity failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    });

// SWAP command
poolCommand
    .command('swap')
    .description('Execute a swap')
    .requiredOption('--from <token>', 'Token to swap from (LVE or UZS)')
    .requiredOption('--amount <number>', 'Amount to swap', parseFloat)
    .requiredOption('--min-out <number>', 'Minimum amount out (slippage protection)', parseFloat)
    .action(async (options) => {
        const poolData = storage.loadPool();
        if (poolData) {
            poolStateManager.loadState(poolData);
        }

        try {
            const result = poolStateManager.swap(
                options.from.toUpperCase(),
                options.amount,
                options.minOut,
                0
            );

            storage.savePool(poolStateManager.getState());

            const tokenOut = options.from.toUpperCase() === 'LVE' ? 'UZS' : 'LVE';

            console.log('');
            console.log(boxTop());
            console.log(boxCenter('💱 Swap Successful'));
            console.log(boxSeparator());
            console.log(boxCenter(`In:   ${options.amount} ${options.from.toUpperCase()}`));
            console.log(boxCenter(`Out:  ${result.amountOut.toFixed(6)} ${tokenOut}`));
            console.log(boxCenter(`Fee:  ${result.fee.toFixed(6)} ${options.from.toUpperCase()}`));
            console.log(boxBottom());
            console.log('');
        } catch (error) {
            console.error(`❌ ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    });
