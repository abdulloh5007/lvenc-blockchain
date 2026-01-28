#!/usr/bin/env node
import 'dotenv/config';
import { webcrypto } from 'node:crypto';

// Polyfill for @noble/ed25519 (requires crypto.subtle)
if (!globalThis.crypto) {
    // @ts-ignore
    globalThis.crypto = webcrypto;
}
import { Command } from 'commander';
import { startNode } from './commands/start.js';
import { identityCommand } from './commands/identity.js';
import { rewardCommand } from './commands/reward.js';
import { poolCommand } from './commands/pool.js';
import { config } from '../config.js';

const program = new Command();

program
    .name('lve-chain')
    .description('LVE Chain Node - Educational Blockchain Network')
    .version(config.version.nodeVersion);

program
    .command('start')
    .description('Start the LVE Chain node')
    .option('-p, --port <number>', 'API server port', '3001')
    .option('--p2p <number>', 'P2P server port', '6001')
    .option('-s, --seed <url>', 'Seed node URL to connect to')
    .option('-d, --data <path>', 'Data directory path', './data')
    .option('-n, --network <name>', 'Network name (mainnet/testnet)', 'mainnet')
    .option('-r, --role <role>', 'Node role (full/validator/rpc/light)')
    .option('--no-api', 'Run without API server (P2P only)')
    .option('-b, --bootstrap', 'Run as bootstrap node (peer discovery only)')
    .option('--api-only', 'Run API server only (no P2P participation)')
    .option('--self-url <url>', 'This node external URL (to skip self-connection in bootstrap)')
    .action(async (options) => {
        await startNode({
            apiPort: parseInt(options.port),
            p2pPort: parseInt(options.p2p),
            seedNode: options.seed,
            dataDir: options.data,
            network: options.network,
            enableApi: options.api !== false,
            bootstrapMode: options.bootstrap === true,
            apiOnlyMode: options.apiOnly === true,
            role: options.role,
            selfUrl: options.selfUrl,
        });
    });

program
    .command('status')
    .description('Show node status')
    .option('-p, --port <number>', 'API server port', '3001')
    .action(async (options) => {
        await showStatus(parseInt(options.port));
    });

program
    .command('peers')
    .description('Show connected peers')
    .option('-p, --port <number>', 'API server port', '3001')
    .action(async (options) => {
        await showPeers(parseInt(options.port));
    });

// Add commands BEFORE parse()
program.addCommand(identityCommand);
program.addCommand(rewardCommand);
program.addCommand(poolCommand);

// Import and add faucet command
import { faucetCommand } from './commands/faucet.js';
program.addCommand(faucetCommand);

// Import and add validator and genesis commands
import { validatorCommand } from './commands/validator.js';
import { genesisCommand } from './commands/genesis.js';
program.addCommand(validatorCommand);
program.addCommand(genesisCommand);

// Parse AFTER all commands are registered
program.parse();

// Inline status function
interface HealthResponse {
    status: string;
    blocks: number;
    peers: number;
    network: string;
}

async function showStatus(port: number): Promise<void> {
    try {
        const response = await fetch(`http://localhost:${port}/health`);
        const data = await response.json() as HealthResponse;

        console.log(`
╔═══════════════════════════════════════╗
║          LVE Chain Node Status        ║
╠═══════════════════════════════════════╣
║  Status:    ${data.status === 'ok' ? '🟢 Running' : '🔴 Error'}              ║
║  Blocks:    ${String(data.blocks).padEnd(20)}      ║
║  Peers:     ${String(data.peers).padEnd(20)}      ║
║  Network:   ${String(data.network).padEnd(20)}    ║
╚═══════════════════════════════════════╝
        `);
    } catch {
        console.log(`
╔═══════════════════════════════════════╗
║          LVE Chain Node Status        ║
╠═══════════════════════════════════════╣
║  Status:    🔴 Offline                ║
║                                       ║
║  Node is not running on port ${port}    ║
╚═══════════════════════════════════════╝
        `);
    }
}

interface NetworkResponse {
    success: boolean;
    data: {
        connectedPeers: number;
        peers?: string[];
    };
}

async function showPeers(port: number): Promise<void> {
    try {
        const response = await fetch(`http://localhost:${port}/api/network`);
        const result = await response.json() as NetworkResponse;

        if (result.success) {
            console.log(`
╔═══════════════════════════════════════╗
║          Connected Peers              ║
╠═══════════════════════════════════════╣`);

            if (result.data.connectedPeers === 0) {
                console.log(`║  No peers connected                   ║`);
            } else {
                console.log(`║  Total peers: ${result.data.connectedPeers}                       ║`);
                result.data.peers?.forEach((peer: string, i: number) => {
                    console.log(`║  ${i + 1}. ${peer.padEnd(32)} ║`);
                });
            }

            console.log(`╚═══════════════════════════════════════╝`);
        }
    } catch {
        console.log(`
╔═══════════════════════════════════════╗
║          Connected Peers              ║
╠═══════════════════════════════════════╣
║  Error: Node is not running           ║
╚═══════════════════════════════════════╝
        `);
    }
}
