/**
 * Reward CLI Command
 * Manage reward address binding for node identity
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { Wallet } from '../../../protocol/wallet/index.js';
import cli, { sym, c } from '../../../protocol/utils/cli.js';

function getDataDir(network: string, dataDir?: string): string {
    if (dataDir) return dataDir;
    return `./data/${network}`;
}

export const rewardCommand = new Command('reward')
    .description('Manage reward address for validator earnings');

// BIND subcommand
rewardCommand
    .command('bind <address>')
    .description('Bind an existing wallet address for rewards')
    .option('-n, --network <name>', 'Network (testnet/mainnet)', 'testnet')
    .option('-d, --data-dir <path>', 'Data directory')
    .action(async (address: string, options) => {
        const dataDir = getDataDir(options.network, options.dataDir);
        const identityPath = path.join(dataDir, 'identity.key');

        if (!fs.existsSync(identityPath)) {
            console.log('');
            cli.error('No identity found');
            console.log(`   Run ${c.primary(`lve-chain start -n ${options.network}`)} first`);
            console.log('');
            process.exit(1);
        }

        if (!address.startsWith('tLVE') && !address.startsWith('LVE')) {
            console.log('');
            cli.error('Invalid address format');
            console.log(`   Address must start with ${c.value('"tLVE"')} (testnet) or ${c.value('"LVE"')} (mainnet)`);
            console.log('');
            process.exit(1);
        }

        try {
            const data = fs.readFileSync(identityPath, 'utf-8');
            const identity = JSON.parse(data);
            identity.rewardAddress = address;
            fs.writeFileSync(identityPath, JSON.stringify(identity, null, 2), { mode: 0o600 });

            console.log('');
            console.log(cli.successBox([
                `${c.label('Address:')} ${c.value(address.slice(0, 24))}...${c.value(address.slice(-8))}`,
                `${c.label('Network:')} ${c.value(options.network)}`,
            ].join('\n'), `${sym.money} Reward Address Bound`));
            console.log('');
            console.log(`${sym.info} Validator rewards will be sent to this address.`);
            console.log('');
            process.exit(0);

        } catch (error) {
            cli.error(`Failed to bind: ${error}`);
            process.exit(1);
        }
    });

// GENERATE subcommand
rewardCommand
    .command('generate')
    .description('Generate a new wallet and bind it as reward address')
    .option('-n, --network <name>', 'Network (testnet/mainnet)', 'testnet')
    .option('-d, --data-dir <path>', 'Data directory')
    .action(async (options) => {
        const dataDir = getDataDir(options.network, options.dataDir);
        const identityPath = path.join(dataDir, 'identity.key');

        if (!fs.existsSync(identityPath)) {
            console.log('');
            cli.error('No identity found');
            console.log(`   Run ${c.primary(`lve-chain start -n ${options.network}`)} first`);
            console.log('');
            process.exit(1);
        }

        try {
            const wallet = await Wallet.create();
            const mnemonic = wallet.mnemonic!;
            const address = wallet.address;

            const data = fs.readFileSync(identityPath, 'utf-8');
            const identity = JSON.parse(data);
            identity.rewardAddress = address;
            fs.writeFileSync(identityPath, JSON.stringify(identity, null, 2), { mode: 0o600 });

            console.log('');
            console.log(cli.successBox([
                `${c.label('Address:')} ${c.value(address)}`,
                `${c.label('Network:')} ${c.value(options.network)}`,
            ].join('\n'), `${sym.money} Reward Wallet Generated`));
            console.log('');
            console.log(`${sym.lock} ${c.warning('IMPORTANT:')} Write down your mnemonic!`);
            console.log('');
            console.log(`   ${c.bold(mnemonic)}`);
            console.log('');
            console.log(`${sym.info} Validator rewards will be sent to this address.`);
            console.log('');
            process.exit(0);

        } catch (error) {
            cli.error(`Failed to generate: ${error}`);
            process.exit(1);
        }
    });

// SHOW subcommand
rewardCommand
    .command('show')
    .description('Show current reward address')
    .option('-n, --network <name>', 'Network (testnet/mainnet)', 'testnet')
    .option('-d, --data-dir <path>', 'Data directory')
    .action(async (options) => {
        const dataDir = getDataDir(options.network, options.dataDir);
        const identityPath = path.join(dataDir, 'identity.key');

        if (!fs.existsSync(identityPath)) {
            console.log('');
            cli.error('No identity found');
            console.log(`   Run ${c.primary(`lve-chain start -n ${options.network}`)} first`);
            console.log('');
            process.exit(1);
        }

        try {
            const data = fs.readFileSync(identityPath, 'utf-8');
            const identity = JSON.parse(data);

            console.log('');
            if (identity.rewardAddress) {
                console.log(cli.infoBox([
                    `${c.label('Address:')} ${c.value(identity.rewardAddress)}`,
                    `${c.label('Network:')} ${c.value(options.network)}`,
                ].join('\n'), `${sym.money} Reward Address`));
            } else {
                cli.warn('No reward address configured');
                console.log('');
                console.log(`${sym.bulb} To set one:`);
                console.log(`   ${c.primary(`lve-chain reward bind <address> -n ${options.network}`)}`);
                console.log(`   ${c.primary(`lve-chain reward generate -n ${options.network}`)}`);
            }
            console.log('');
            process.exit(0);

        } catch (error) {
            cli.error(`Failed to read: ${error}`);
            process.exit(1);
        }
    });
