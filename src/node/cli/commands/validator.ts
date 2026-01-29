/**
 * Validator CLI Command
 * 
 * Manage validator consensus keys
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { initValidatorKey, VALIDATOR_KEY_FILE } from '../../../protocol/consensus/index.js';
import cli, { sym, c } from '../../../protocol/utils/cli.js';

function getDataDir(network: string, dataDir?: string): string {
    if (dataDir) return dataDir;
    return `./data/${network}`;
}

export const validatorCommand = new Command('validator')
    .description('Manage validator consensus keys');

// validator init
validatorCommand
    .command('init')
    .description('Generate a new validator consensus key')
    .option('-n, --network <name>', 'Network (testnet/mainnet)', 'testnet')
    .option('-d, --data-dir <path>', 'Data directory')
    .action(async (options) => {
        const dataDir = getDataDir(options.network, options.dataDir);
        const keyPath = path.join(dataDir, VALIDATOR_KEY_FILE);

        if (fs.existsSync(keyPath)) {
            console.log('');
            cli.warn(`Validator key already exists at ${keyPath}`);
            console.log(c.dim('  To regenerate, first backup and delete the existing key.'));
            console.log('');
            process.exit(0);
        }

        try {
            const key = await initValidatorKey(dataDir);

            console.log('');
            console.log(cli.successBox([
                `${c.label('Address:')}  ${c.value(key.getAddress())}`,
                `${c.label('PubKey:')}   ${c.value(key.getPubKey().slice(0, 32))}...`,
                `${c.label('Path:')}     ${c.value(keyPath)}`,
            ].join('\n'), `${sym.key} Validator Key Created`));
            console.log('');
            console.log(`${sym.lock} ${c.warning('Keep this key safe!')} It controls your validator identity.`);
            console.log('');
            console.log(`${sym.bulb} ${c.bold('Next steps:')}`);
            console.log(`   1. Add to genesis: ${c.primary(`lve-chain genesis add-validator --pubkey ${key.getPubKey()}`)}`);
            console.log(`   2. Start node: ${c.primary('lve-chain start --role validator')}`);
            console.log('');
            process.exit(0);
        } catch (error) {
            console.log('');
            cli.error(`Failed to create validator key: ${error}`);
            process.exit(1);
        }
    });

// validator show
validatorCommand
    .command('show')
    .description('Show validator key info')
    .option('-n, --network <name>', 'Network (testnet/mainnet)', 'testnet')
    .option('-d, --data-dir <path>', 'Data directory')
    .option('--pubkey', 'Output only the public key')
    .action(async (options) => {
        const dataDir = getDataDir(options.network, options.dataDir);
        const keyPath = path.join(dataDir, VALIDATOR_KEY_FILE);

        if (!fs.existsSync(keyPath)) {
            console.log('');
            cli.error('No validator key found');
            console.log(`   Run ${c.primary('lve-chain validator init')} to create one`);
            console.log('');
            process.exit(1);
        }

        // For --pubkey, read file directly to avoid module initialization logs
        if (options.pubkey) {
            try {
                const data = fs.readFileSync(keyPath, 'utf-8');
                const key = JSON.parse(data);
                console.log(key.pub_key.value);
                process.exit(0);
            } catch (error) {
                cli.error('Failed to read validator key');
                process.exit(1);
            }
        }

        try {
            const key = await initValidatorKey(dataDir);

            console.log('');
            console.log(cli.infoBox([
                `${c.label('Address:')}  ${c.value(key.getAddress())}`,
                `${c.label('PubKey:')}   ${c.value(key.getPubKey().slice(0, 40))}...`,
                `${c.label('Network:')}  ${c.value(options.network)}`,
            ].join('\n'), `${sym.key} Validator Key`));
            console.log('');
            process.exit(0);
        } catch (error) {
            console.log('');
            cli.error(`Failed to read validator key: ${error}`);
            process.exit(1);
        }
    });
