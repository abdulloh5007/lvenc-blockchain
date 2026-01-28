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
import cli, { sym, c } from '../../../protocol/utils/cli.js';

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
            cli.warn(`genesis.json already exists at ${genesisPath}`);
            console.log(c.dim('  To recreate, first backup and delete the existing file.'));
            console.log('');
            process.exit(0);
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
        console.log(cli.successBox([
            `${c.label('Chain ID:')}  ${c.value(genesis.chainId)}`,
            `${c.label('Faucet:')}    ${c.value(faucetAddress.slice(0, 20))}...`,
            `${c.label('Path:')}      ${c.value(genesisPath)}`,
        ].join('\n'), `${sym.check} Genesis Initialized`));
        console.log('');
        console.log(`${sym.bulb} ${c.bold('Next steps:')}`);
        console.log(`   1. Create validator key: ${c.primary('lve-chain validator init')}`);
        console.log(`   2. Add validator: ${c.primary('lve-chain genesis add-validator --pubkey <KEY>')}`);
        console.log(`   3. Start node: ${c.primary('lve-chain start --role validator')}`);
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
            console.log('');
            cli.error('No genesis.json found. Run `lve-chain genesis init` first.');
            console.log('');
            process.exit(1);
        }

        // Derive address from pubkey if not provided
        const operatorAddress = options.address ||
            (chainParams.addressPrefix + options.pubkey.slice(0, 36));

        // Check for duplicate
        if (genesis.validators.some(v => v.consensusPubKey === options.pubkey)) {
            console.log('');
            cli.warn('Validator with this pubkey already exists in genesis');
            console.log('');
            process.exit(0);
        }

        genesis.validators.push({
            operatorAddress,
            consensusPubKey: options.pubkey,
            power: parseInt(options.power, 10),
            moniker: options.moniker
        });

        saveGenesisConfig(dataDir, genesis);

        console.log('');
        console.log(cli.successBox([
            `${c.label('Address:')}  ${c.value(operatorAddress.slice(0, 24))}...`,
            `${c.label('Power:')}    ${c.value(options.power)}`,
            `${c.label('Moniker:')}  ${c.value(options.moniker)}`,
        ].join('\n'), `${sym.check} Genesis Validator Added`));
        console.log('');
        console.log(`${sym.info} Total validators in genesis: ${c.bold(genesis.validators.length.toString())}`);
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
            console.log('');
            cli.error('No genesis.json found');
            console.log('');
            process.exit(1);
        }

        console.log('');
        console.log(cli.infoBox([
            `${c.label('Chain ID:')}      ${c.value(genesis.chainId)}`,
            `${c.label('Genesis Time:')}  ${c.value(new Date(genesis.genesisTime).toISOString())}`,
            `${c.label('Validators:')}    ${c.value(genesis.validators.length.toString())}`,
            `${c.label('Accounts:')}      ${c.value(genesis.initialBalances.length.toString())}`,
        ].join('\n'), `${sym.file} Genesis Configuration`));

        if (genesis.validators.length > 0) {
            console.log('');
            console.log(`${sym.info} ${c.bold('Validators:')}`);
            for (const v of genesis.validators) {
                console.log(`   ${sym.pointer} ${c.value(v.moniker || 'unnamed')}: ${c.dim(v.operatorAddress.slice(0, 16))}... ${c.dim(`(power: ${v.power})`)}`);
            }
        }
        console.log('');
        process.exit(0);
    });
