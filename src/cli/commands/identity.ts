/**
 * Identity CLI Command
 * View and manage node cryptographic identity
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';

interface IdentityData {
    nodeId: string;
    rewardAddress: string | null;
    createdAt: number;
}

// Helper to get data dir based on network
function getDataDir(network: string, dataDir?: string): string {
    if (dataDir) return dataDir;
    return `./data/${network}`;
}

export const identityCommand = new Command('identity')
    .description('View node cryptographic identity')
    .option('-n, --network <name>', 'Network (testnet/mainnet)', 'testnet')
    .option('-d, --data-dir <path>', 'Data directory (overrides network)')
    .option('--export', 'Export public identity as JSON')
    .action(async (options) => {
        const dataDir = getDataDir(options.network, options.dataDir);
        const identityPath = path.join(dataDir, 'identity.key');

        if (!fs.existsSync(identityPath)) {
            console.log('');
            console.log('❌ No identity found');
            console.log(`   Run 'edu-chain start -n ${options.network}' to generate an identity`);
            console.log(`   Expected location: ${identityPath}`);
            console.log('');
            process.exit(1);
        }

        try {
            const data = fs.readFileSync(identityPath, 'utf-8');
            const identity: IdentityData & { privateKey?: string } = JSON.parse(data);

            if (options.export) {
                // Export public identity only (no private key)
                const publicIdentity = {
                    nodeId: identity.nodeId,
                    rewardAddress: identity.rewardAddress,
                    createdAt: identity.createdAt,
                };
                console.log(JSON.stringify(publicIdentity, null, 2));
                return;
            }

            const createdDate = new Date(identity.createdAt).toISOString().split('T')[0];
            const shortId = `${identity.nodeId.slice(0, 16)}...${identity.nodeId.slice(-16)}`;

            console.log('');
            console.log('╔═══════════════════════════════════════════════════════════╗');
            console.log('║                    🔑 Node Identity                       ║');
            console.log('╠═══════════════════════════════════════════════════════════╣');
            console.log(`║  Node ID:        ${shortId} ║`);
            console.log(`║  Reward Address: ${(identity.rewardAddress || 'Not set').padEnd(40)} ║`);
            console.log(`║  Created:        ${createdDate.padEnd(40)} ║`);
            console.log(`║  Network:        ${options.network.padEnd(40)} ║`);
            console.log('╚═══════════════════════════════════════════════════════════╝');
            console.log('');
            console.log('💡 To bind a reward address:');
            console.log(`   edu-chain reward bind <address> -n ${options.network}`);
            console.log('');
            console.log('💡 To export public identity:');
            console.log('   edu-chain identity --export');
            console.log('');

        } catch (error) {
            console.error('❌ Failed to read identity:', error);
            process.exit(1);
        }
    });
