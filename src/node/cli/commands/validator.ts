/**
 * Validator CLI Command
 * 
 * Manage validator consensus keys
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { initValidatorKey, VALIDATOR_KEY_FILE } from '../../../protocol/consensus/index.js';
import { boxCenter, boxSeparator, boxTop, boxBottom } from '../../../protocol/utils/box.js';

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
            console.log('⚠️  Validator key already exists!');
            console.log(`   Path: ${keyPath}`);
            console.log('');
            console.log('To regenerate, first backup and delete the existing key.');
            return;
        }

        try {
            const key = await initValidatorKey(dataDir);

            console.log('');
            console.log(boxTop());
            console.log(boxCenter('✅ Validator Key Created'));
            console.log(boxSeparator());
            console.log(boxCenter(`Address:   ${key.getAddress()}`));
            console.log(boxCenter(`PubKey:    ${key.getPubKey().slice(0, 32)}...`));
            console.log(boxCenter(`Path:      ${keyPath}`));
            console.log(boxBottom());
            console.log('');
            console.log('🔐 Keep this key safe! It controls your validator identity.');
            console.log('');
            console.log('Next steps:');
            console.log('  1. Add this validator to genesis:');
            console.log(`     lve-chain genesis add-validator --pubkey ${key.getPubKey()}`);
            console.log('  2. Start your validator node:');
            console.log('     lve-chain start --role validator');
            console.log('');
        } catch (error) {
            console.error(`❌ Failed to create validator key: ${error}`);
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
            console.log('❌ No validator key found');
            console.log(`   Run 'lve-chain validator init' to create one`);
            console.log('');
            process.exit(1);
        }

        try {
            const key = await initValidatorKey(dataDir);

            if (options.pubkey) {
                // Output only pubkey (for scripting)
                console.log(key.getPubKey());
                return;
            }

            console.log('');
            console.log(boxTop());
            console.log(boxCenter('Validator Key'));
            console.log(boxSeparator());
            console.log(boxCenter(`Address: ${key.getAddress()}`));
            console.log(boxCenter(`PubKey:  ${key.getPubKey().slice(0, 40)}...`));
            console.log(boxCenter(`Network: ${options.network}`));
            console.log(boxBottom());
            console.log('');
        } catch (error) {
            console.error(`❌ Failed to read validator key: ${error}`);
            process.exit(1);
        }
    });
