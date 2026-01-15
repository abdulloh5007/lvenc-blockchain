#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import { startNode } from './commands/start.js';

const program = new Command();

program
    .name('edu-chain')
    .description('EDU Chain Node - Educational Blockchain Network')
    .version('1.0.0');

program
    .command('start')
    .description('Start the EDU Chain node')
    .option('-p, --port <number>', 'API server port', '3001')
    .option('--p2p <number>', 'P2P server port', '6001')
    .option('-s, --seed <url>', 'Seed node URL to connect to')
    .option('-d, --data <path>', 'Data directory path', './data')
    .option('-n, --network <name>', 'Network name (mainnet/testnet)', 'mainnet')
    .option('--no-api', 'Run without API server (P2P only)')
    .option('-b, --bootstrap', 'Run as bootstrap node (peer discovery only)')
    .action(async (options) => {
        await startNode({
            apiPort: parseInt(options.port),
            p2pPort: parseInt(options.p2p),
            seedNode: options.seed,
            dataDir: options.data,
            network: options.network,
            enableApi: options.api !== false,
            bootstrapMode: options.bootstrap === true,
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
║          EDU Chain Node Status        ║
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
║          EDU Chain Node Status        ║
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
