/**
 * Genesis CLI Command
 * 
 * Create and manage genesis configuration
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import {
    createDefaultGenesis,
    saveGenesisConfig,
    loadGenesisConfig,
    GenesisConfig
} from '../../../protocol/consensus/index.js';
import { chainParams } from '../../../protocol/params/index.js';
import { boxCenter, boxSeparator, boxTop, boxBottom } from '../../../protocol/utils/box.js';

function getDataDir(network: string, dataDir?: string): string {
    if (dataDir) return dataDir;
    return `./data/${network}`;
}

export const genesisCommand = new Command('genesis')
    .description('Create and manage genesis configuration');

// genesis init
genesisCommand
    .command('init')
    .description('Initialize a new genesis configuration')
    .option('-n, --network <name>', 'Network (testnet/mainnet)', 'testnet')
    .option('-d, --data-dir <path>', 'Data directory')
    .option('--chain-id <id>', 'Chain ID', 'lvenc-testnet-1')
    .action(async (options) => {
        const dataDir = getDataDir(options.network, options.dataDir);
        const genesisPath = path.join(dataDir, 'genesis.json');

        if (fs.existsSync(genesisPath)) {
            console.log('');
            console.log('⚠  genesis.json already exists!');
            console.log(`   Path: ${genesisPath}`);
            console.log('');
            console.log('To recreate, first backup and delete the existing file.');
            return;
        }

        // Create empty genesis
        const prefix = options.network === 'testnet' ? 'tLVE' : 'LVE';
        const faucetAddress = `${prefix}0000000000000000000000000000000000000001`;

        const genesis = createDefaultGenesis(
            options.chainId,
            faucetAddress,
            1000000  // 1M initial supply
        );

        saveGenesisConfig(dataDir, genesis);

        console.log('');
        console.log(boxTop());
        console.log(boxCenter('✓ Genesis Initialized'));
        console.log(boxSeparator());
        console.log(boxCenter(`Chain ID:  ${genesis.chainId}`));
        console.log(boxCenter(`Faucet:    ${faucetAddress.slice(0, 16)}...`));
        console.log(boxCenter(`Path:      ${genesisPath}`));
        console.log(boxBottom());
        console.log('');
        console.log('Next steps:');
        console.log('  1. Create validator key: lve-chain validator init');
        console.log('  2. Add validator: lve-chain genesis add-validator --pubkey <KEY>');
        console.log('  3. Start node: lve-chain start --role validator');
        console.log('');
        process.exit(0);
    });

// genesis add-validator
genesisCommand
    .command('add-validator')
    .description('Add a genesis validator')
    .option('-n, --network <name>', 'Network (testnet/mainnet)', 'testnet')
    .option('-d, --data-dir <path>', 'Data directory')
    .requiredOption('--pubkey <key>', 'Validator consensus public key (hex)')
    .option('--power <amount>', 'Validator power (stake)', '1000')
    .option('--address <addr>', 'Operator address (defaults to derived)')
    .option('--moniker <name>', 'Validator name', 'genesis-validator')
    .action(async (options) => {
        const dataDir = getDataDir(options.network, options.dataDir);
        let genesis = loadGenesisConfig(dataDir);

        if (!genesis) {
            console.log('✗ No genesis.json found. Run `lve-chain genesis init` first.');
            process.exit(1);
        }

        // Derive address from pubkey if not provided
        const operatorAddress = options.address ||
            (chainParams.addressPrefix + options.pubkey.slice(0, 36));

        // Check for duplicate
        if (genesis.validators.some(v => v.consensusPubKey === options.pubkey)) {
            console.log('⚠  Validator with this pubkey already exists in genesis');
            return;
        }

        genesis.validators.push({
            operatorAddress,
            consensusPubKey: options.pubkey,
            power: parseInt(options.power, 10),
            moniker: options.moniker
        });

        saveGenesisConfig(dataDir, genesis);

        console.log('');
        console.log(boxTop());
        console.log(boxCenter('✓ Genesis Validator Added'));
        console.log(boxSeparator());
        console.log(boxCenter(`Address:  ${operatorAddress.slice(0, 20)}...`));
        console.log(boxCenter(`Power:    ${options.power}`));
        console.log(boxCenter(`Moniker:  ${options.moniker}`));
        console.log(boxBottom());
        console.log('');
        console.log(`Total validators in genesis: ${genesis.validators.length}`);
        console.log('');
        process.exit(0);
    });

// genesis show
genesisCommand
    .command('show')
    .description('Show genesis configuration')
    .option('-n, --network <name>', 'Network (testnet/mainnet)', 'testnet')
    .option('-d, --data-dir <path>', 'Data directory')
    .action(async (options) => {
        const dataDir = getDataDir(options.network, options.dataDir);
        const genesis = loadGenesisConfig(dataDir);

        if (!genesis) {
            console.log('✗ No genesis.json found');
            process.exit(1);
        }

        console.log('');
        console.log(boxTop());
        console.log(boxCenter('Genesis Configuration'));
        console.log(boxSeparator());
        console.log(boxCenter(`Chain ID:     ${genesis.chainId}`));
        console.log(boxCenter(`Genesis Time: ${new Date(genesis.genesisTime).toISOString()}`));
        console.log(boxCenter(`Validators:   ${genesis.validators.length}`));
        console.log(boxCenter(`Accounts:     ${genesis.initialBalances.length}`));
        console.log(boxBottom());

        if (genesis.validators.length > 0) {
            console.log('');
            console.log('Validators:');
            for (const v of genesis.validators) {
                console.log(`  - ${v.moniker || 'unnamed'}: ${v.operatorAddress.slice(0, 16)}... (power: ${v.power})`);
            }
        }
        console.log('');
        process.exit(0);
    });
