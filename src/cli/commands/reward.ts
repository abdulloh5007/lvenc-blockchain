/**
 * Reward CLI Command
 * Manage reward address binding for node identity
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { Wallet } from '../../wallet/index.js';

// Helper to get data dir based on network
function getDataDir(network: string, dataDir?: string): string {
    if (dataDir) return dataDir;
    return `./data/${network}`;
}

export const rewardCommand = new Command('reward')
    .description('Manage reward address for validator earnings');

// ==================== BIND SUBCOMMAND ====================

rewardCommand
    .command('bind <address>')
    .description('Bind an existing wallet address for rewards')
    .option('-n, --network <name>', 'Network (testnet/mainnet)', 'testnet')
    .option('-d, --data-dir <path>', 'Data directory (overrides network)')
    .action(async (address: string, options) => {
        const dataDir = getDataDir(options.network, options.dataDir);
        const identityPath = path.join(dataDir, 'identity.key');

        if (!fs.existsSync(identityPath)) {
            console.log('');
            console.log('❌ No identity found');
            console.log(`   Run 'edu-chain start -n ${options.network}' first to generate an identity`);
            console.log('');
            process.exit(1);
        }

        // Validate address format
        if (!address.startsWith('tEDU') && !address.startsWith('EDU')) {
            console.log('');
            console.log('❌ Invalid address format');
            console.log('   Address must start with "tEDU" (testnet) or "EDU" (mainnet)');
            console.log('');
            process.exit(1);
        }

        try {
            // Load and update identity
            const data = fs.readFileSync(identityPath, 'utf-8');
            const identity = JSON.parse(data);
            identity.rewardAddress = address;
            fs.writeFileSync(identityPath, JSON.stringify(identity, null, 2), { mode: 0o600 });

            console.log('');
            console.log('╔═══════════════════════════════════════════════════════════╗');
            console.log('║              ✅ Reward Address Bound                      ║');
            console.log('╠═══════════════════════════════════════════════════════════╣');
            console.log(`║  Address: ${address.slice(0, 20)}...${address.slice(-8)}       ║`);
            console.log(`║  Network: ${options.network.padEnd(46)} ║`);
            console.log('╚═══════════════════════════════════════════════════════════╝');
            console.log('');
            console.log('💡 Validator rewards will be sent to this address.');
            console.log('');

        } catch (error) {
            console.error('❌ Failed to bind reward address:', error);
            process.exit(1);
        }
    });

// ==================== GENERATE SUBCOMMAND ====================

rewardCommand
    .command('generate')
    .description('Generate a new wallet and bind it as reward address')
    .option('-n, --network <name>', 'Network (testnet/mainnet)', 'testnet')
    .option('-d, --data-dir <path>', 'Data directory (overrides network)')
    .action(async (options) => {
        const dataDir = getDataDir(options.network, options.dataDir);
        const identityPath = path.join(dataDir, 'identity.key');

        if (!fs.existsSync(identityPath)) {
            console.log('');
            console.log('❌ No identity found');
            console.log(`   Run 'edu-chain start -n ${options.network}' first to generate an identity`);
            console.log('');
            process.exit(1);
        }

        try {
            // Generate new wallet (constructor without args creates new wallet with mnemonic)
            const wallet = new Wallet();
            const mnemonic = wallet.mnemonic!;
            const address = wallet.address;

            // Update identity with reward address
            const data = fs.readFileSync(identityPath, 'utf-8');
            const identity = JSON.parse(data);
            identity.rewardAddress = address;
            fs.writeFileSync(identityPath, JSON.stringify(identity, null, 2), { mode: 0o600 });

            console.log('');
            console.log('╔════════════════════════════════════════════════════════════════════════════╗');
            console.log('║                     ✅ Reward Wallet Generated                             ║');
            console.log('╠════════════════════════════════════════════════════════════════════════════╣');
            console.log(`║  Reward Address: ${address}              ║`);
            console.log(`║  Network:        ${options.network.padEnd(55)}   ║`);
            console.log('╚════════════════════════════════════════════════════════════════════════════╝');
            console.log('');
            console.log('🔒 Write down your mnemonic and store it securely!');
            console.log('   Here it is:');
            console.log('');
            console.log(`   ${mnemonic}`);
            console.log('');
            console.log('💡 Validator rewards will be sent to this address.');
            console.log('');

        } catch (error) {
            console.error('❌ Failed to generate reward wallet:', error);
            process.exit(1);
        }
    });

// ==================== SHOW SUBCOMMAND ====================

rewardCommand
    .command('show')
    .description('Show current reward address')
    .option('-n, --network <name>', 'Network (testnet/mainnet)', 'testnet')
    .option('-d, --data-dir <path>', 'Data directory (overrides network)')
    .action(async (options) => {
        const dataDir = getDataDir(options.network, options.dataDir);
        const identityPath = path.join(dataDir, 'identity.key');

        if (!fs.existsSync(identityPath)) {
            console.log('');
            console.log('❌ No identity found');
            console.log(`   Run 'edu-chain start -n ${options.network}' first to generate an identity`);
            console.log('');
            process.exit(1);
        }

        try {
            const data = fs.readFileSync(identityPath, 'utf-8');
            const identity = JSON.parse(data);

            console.log('');
            if (identity.rewardAddress) {
                console.log('╔═══════════════════════════════════════════════════════════╗');
                console.log('║                    💰 Reward Address                      ║');
                console.log('╠═══════════════════════════════════════════════════════════╣');
                console.log(`║  ${identity.rewardAddress.padEnd(55)}  ║`);
                console.log(`║  Network: ${options.network.padEnd(46)}  ║`);
                console.log('╚═══════════════════════════════════════════════════════════╝');
            } else {
                console.log('❌ No reward address configured');
                console.log('');
                console.log('💡 To set a reward address:');
                console.log(`   edu-chain reward bind <address> -n ${options.network}`);
                console.log(`   edu-chain reward generate -n ${options.network}`);
            }
            console.log('');

        } catch (error) {
            console.error('❌ Failed to read identity:', error);
            process.exit(1);
        }
    });
