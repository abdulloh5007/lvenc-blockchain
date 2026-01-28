/**
 * Identity CLI Command
 * View and manage node cryptographic identity
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import cli, { sym, c } from '../../../protocol/utils/cli.js';

interface IdentityData {
    nodeId: string;
    rewardAddress: string | null;
    createdAt: number;
}

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
            cli.error('No identity found');
            console.log(`   Run ${c.primary(`lve-chain start -n ${options.network}`)} to generate an identity`);
            console.log(`   Expected: ${c.dim(identityPath)}`);
            console.log('');
            process.exit(1);
        }

        try {
            const data = fs.readFileSync(identityPath, 'utf-8');
            const identity: IdentityData & { privateKey?: string } = JSON.parse(data);

            if (options.export) {
                const publicIdentity = {
                    nodeId: identity.nodeId,
                    rewardAddress: identity.rewardAddress,
                    createdAt: identity.createdAt,
                };
                console.log(JSON.stringify(publicIdentity, null, 2));
                process.exit(0);
            }

            const createdDate = new Date(identity.createdAt).toISOString().split('T')[0];
            const shortId = `${identity.nodeId.slice(0, 16)}...${identity.nodeId.slice(-16)}`;
            const shortReward = identity.rewardAddress
                ? `${identity.rewardAddress.slice(0, 12)}...${identity.rewardAddress.slice(-8)}`
                : c.dim('Not set');

            console.log('');
            console.log(cli.infoBox([
                `${c.label('Node ID:')}        ${c.value(shortId)}`,
                `${c.label('Reward Address:')} ${identity.rewardAddress ? c.value(shortReward) : shortReward}`,
                `${c.label('Created:')}        ${c.value(createdDate)}`,
                `${c.label('Network:')}        ${c.value(options.network)}`,
            ].join('\n'), `${sym.chain} Node Identity`));
            console.log('');
            console.log(`${sym.bulb} ${c.bold('Tip:')} To bind a reward address:`);
            console.log(`   ${c.primary(`lve-chain reward bind <address> -n ${options.network}`)}`);
            console.log('');
            process.exit(0);

        } catch (error) {
            cli.error(`Failed to read identity: ${error}`);
            process.exit(1);
        }
    });
