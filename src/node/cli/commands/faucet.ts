/**
 * Faucet CLI Commands
 * Request test tokens (LVE + USDT) on testnet
 */

import { Command } from 'commander';
import { usdtBalanceManager } from '../../../runtime/pool/index.js';
import { config } from '../../config.js';
import cli, { sym, c } from '../../../protocol/utils/cli.js';

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
            console.log(cli.warningBox(
                'USDT faucet is only available on testnet',
                `${sym.x} Faucet Unavailable`
            ));
            console.log('');
            process.exit(0);
        }

        const result = usdtBalanceManager.requestFromFaucet(options.address);

        console.log('');
        if (result.success) {
            console.log(cli.successBox([
                `${c.label('Received:')} ${c.success(`+${result.amount} USDT`)}`,
                `${c.label('Balance:')}  ${c.value(`${result.balance} USDT`)}`,
            ].join('\n'), `${sym.money} USDT Faucet`));
            console.log('');
            console.log(`${sym.bulb} Use: ${c.primary('lve-chain pool swap --from USDT')}`);
        } else {
            console.log(cli.warningBox([
                result.error || 'Unknown error',
                result.balance > 0 ? `Current balance: ${result.balance} USDT` : '',
            ].filter(Boolean).join('\n'), `${sym.warning_emoji} Request Failed`));
        }
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
        console.log(cli.infoBox([
            `${c.label('Address:')} ${c.value(options.address.slice(0, 24))}...`,
            `${c.label('Balance:')} ${c.value(`${balance} USDT`)}`,
            '',
            `${c.dim(`Max: ${info.maxBalance} USDT | Faucet: ${info.amount} USDT/request`)}`,
        ].join('\n'), `${sym.money} USDT Balance`));
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
        console.log(cli.infoBox([
            `${c.label('Status:')}   ${info.enabled ? c.success('✓ Enabled') : c.error('✗ Disabled')}`,
            `${c.label('Network:')}  ${c.value(config.network_mode)}`,
            `${c.label('Amount:')}   ${c.value(`${info.amount} USDT/request`)}`,
            `${c.label('Cooldown:')} ${c.value(`${info.cooldownMs / 1000}s`)}`,
            `${c.label('Max:')}      ${c.value(`${info.maxBalance} USDT`)}`,
        ].join('\n'), `${sym.gear} Faucet Config`));
        console.log('');
        process.exit(0);
    });
