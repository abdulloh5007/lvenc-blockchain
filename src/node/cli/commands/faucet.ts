/**
 * Faucet CLI Commands
 * Request test tokens (LVE + USDT) on testnet
 */

import { Command } from 'commander';
import { usdtBalanceManager } from '../../../runtime/pool/index.js';
import { boxCenter, boxSeparator, boxTop, boxBottom, boxEmpty } from '../../../protocol/utils/box.js';
import { config } from '../../config.js';

export const faucetCommand = new Command('faucet')
    .description('Request test tokens (testnet only)');

// USDT faucet
faucetCommand
    .command('usdt')
    .description('Request test USDT for swap testing')
    .requiredOption('--address <address>', 'Your wallet address')
    .action(async (options) => {
        if (!config.isTestnet) {
            console.log('');
            console.log(boxTop());
            console.log(boxCenter('✗ Faucet Unavailable'));
            console.log(boxSeparator());
            console.log(boxCenter('USDT faucet is only available on testnet'));
            console.log(boxBottom());
            console.log('');
            return;
        }

        const result = usdtBalanceManager.requestFromFaucet(options.address);

        console.log('');
        console.log(boxTop());

        if (result.success) {
            console.log(boxCenter('● USDT Faucet'));
            console.log(boxSeparator());
            console.log(boxCenter(`Received: +${result.amount} USDT`));
            console.log(boxCenter(`Balance:  ${result.balance} USDT`));
            console.log(boxEmpty());
            console.log(boxCenter('Use: lve-chain pool swap --from USDT'));
        } else {
            console.log(boxCenter('⚠ Faucet Request Failed'));
            console.log(boxSeparator());
            console.log(boxCenter(result.error || 'Unknown error'));
            if (result.balance > 0) {
                console.log(boxCenter(`Current balance: ${result.balance} USDT`));
            }
        }

        console.log(boxBottom());
        console.log('');
        process.exit(0);
    });

// Balance check
faucetCommand
    .command('balance')
    .description('Check USDT balance')
    .requiredOption('--address <address>', 'Wallet address')
    .action(async (options) => {
        const balance = usdtBalanceManager.getBalance(options.address);
        const info = usdtBalanceManager.getFaucetInfo();

        console.log('');
        console.log(boxTop());
        console.log(boxCenter('● USDT Balance'));
        console.log(boxSeparator());
        console.log(boxCenter(`Address: ${options.address.slice(0, 20)}...`));
        console.log(boxCenter(`Balance: ${balance} USDT`));
        console.log(boxEmpty());
        console.log(boxCenter(`Max: ${info.maxBalance} USDT`));
        console.log(boxCenter(`Faucet: ${info.amount} USDT/request`));
        console.log(boxBottom());
        console.log('');
        process.exit(0);
    });

// Faucet info
faucetCommand
    .command('info')
    .description('Show faucet configuration')
    .action(async () => {
        const info = usdtBalanceManager.getFaucetInfo();

        console.log('');
        console.log(boxTop());
        console.log(boxCenter('● Faucet Info'));
        console.log(boxSeparator());
        console.log(boxCenter(`Status:   ${info.enabled ? '✓ Enabled' : '✗ Disabled'}`));
        console.log(boxCenter(`Network:  ${config.network_mode}`));
        console.log(boxCenter(`Amount:   ${info.amount} USDT/request`));
        console.log(boxCenter(`Cooldown: ${info.cooldownMs / 1000}s`));
        console.log(boxCenter(`Max:      ${info.maxBalance} USDT`));
        console.log(boxBottom());
        console.log('');
        process.exit(0);
    });
