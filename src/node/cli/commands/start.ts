import 'dotenv/config';
import * as net from 'net';
import * as readline from 'readline';
import express, { Express } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from '../../api/swagger.js';
import { Blockchain, Transaction, Block } from '../../../protocol/blockchain/index.js';
import { P2PServer } from '../../../network/index.js';
import { storage } from '../../../protocol/storage/index.js';
import { Wallet } from '../../../protocol/wallet/index.js';
import { logger } from '../../../protocol/utils/logger.js';
import { NFTManager } from '../../../runtime/nft/index.js';
import { initBlockProducer, stakingPool } from '../../../runtime/staking/index.js';
import { config } from '../../config.js';
import { boxBottom, boxCenter, boxEmpty, boxSeparator, boxTop } from '../../../protocol/utils/box.js';
import { getRole, RoleConfig, RoleName } from '../../roles/index.js';

import { createBlockchainRoutes } from '../../api/routes/blockchain.js';
import { createWalletRoutes } from '../../api/routes/wallet.js';
import { createTransactionRoutes } from '../../api/routes/transaction.js';
import { createNetworkRoutes } from '../../api/routes/network.js';
import { createNFTRoutes } from '../../api/routes/nft.js';
import { createIPFSRoutes } from '../../api/routes/ipfs.js';
import { createStakingRoutes } from '../../api/routes/staking.js';
import { createNodeRoutes } from '../../api/routes/node.js';
import { createPoolRoutes } from '../../api/routes/pool.js';

export interface NodeOptions {
    apiPort: number;
    p2pPort: number;
    seedNode?: string;
    dataDir: string;
    network: string;
    enableApi: boolean;
    bootstrapMode?: boolean;
    apiOnlyMode?: boolean; // API server only, no P2P participation
    role?: RoleName; // Node role (full, validator, rpc, light)
    selfUrl?: string; // This node's external URL (to prevent self-connection)
}

// Create readline interface for prompts
function createPrompt(): readline.Interface {
    return readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
}

// Ask user a question with default answer
async function ask(question: string, defaultAnswer: string = ''): Promise<string> {
    const rl = createPrompt();
    return new Promise((resolve) => {
        const prompt = defaultAnswer ? `${question} [${defaultAnswer}]: ` : `${question}: `;
        rl.question(prompt, (answer) => {
            rl.close();
            resolve(answer.trim() || defaultAnswer);
        });
    });
}

// Ask yes/no question
async function confirm(question: string, defaultYes: boolean = true): Promise<boolean> {
    const rl = createPrompt();
    return new Promise((resolve) => {
        const hint = defaultYes ? '[Y/n]' : '[y/N]';
        rl.question(`${question} ${hint} `, (answer) => {
            rl.close();
            const a = answer.trim().toLowerCase();
            if (a === '') resolve(defaultYes);
            else resolve(a === 'y' || a === 'yes');
        });
    });
}

// Check if port is available
async function isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', () => resolve(false));
        server.once('listening', () => {
            server.close();
            resolve(true);
        });
        server.listen(port);
    });
}

// Find available port starting from given port
async function findAvailablePort(startPort: number): Promise<number> {
    let port = startPort;
    while (!(await isPortAvailable(port))) {
        port++;
        if (port > startPort + 100) {
            throw new Error('Could not find available port');
        }
    }
    return port;
}

export async function startNode(options: NodeOptions): Promise<void> {
    // Load role configuration
    const roleConfig = options.role ? getRole(options.role) : undefined;
    if (options.role && !roleConfig) {
        logger.error(`Unknown role: ${options.role}. Available: full, validator, rpc, light`);
        process.exit(1);
    }

    const version = `v${config.version.nodeVersion}`;
    const roleLabel = roleConfig ? ` [${roleConfig.name.toUpperCase()}]` : '';
    const mode = options.bootstrapMode ? 'BOOTSTRAP NODE' : `LVE CHAIN Node${roleLabel}`;
    const versionLine = `${mode} ${version}`;

    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log(boxEmpty());
    console.log(boxCenter('██╗     ██╗   ██╗███████╗███╗   ██╗ ██████╗'));
    console.log(boxCenter('██║     ██║   ██║██╔════╝████╗  ██║██╔════╝'));
    console.log(boxCenter('██║     ██║   ██║█████╗  ██╔██╗ ██║██║     '));
    console.log(boxCenter('██║     ╚██╗ ██╔╝██╔══╝  ██║╚██╗██║██║     '));
    console.log(boxCenter('███████╗ ╚████╔╝ ███████╗██║ ╚████║╚██████╗'));
    console.log(boxCenter('╚══════╝  ╚═══╝  ╚══════╝╚═╝  ╚═══╝ ╚═════╝'));
    console.log(boxEmpty());
    console.log(boxCenter(versionLine));
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log('');

    // Interactive network selection if not specified via CLI
    let network = options.network;
    if (network === 'mainnet') {
        console.log('\n🌐 Select network:');
        console.log('   1. mainnet (production)');
        console.log('   2. testnet (testing)\n');
        const choice = await ask('Enter choice (1 or 2)', '1');
        network = choice === '2' ? 'testnet' : 'mainnet';
    }

    // Check API port availability
    let apiPort = options.apiPort;
    if (!(await isPortAvailable(apiPort))) {
        const nextPort = await findAvailablePort(apiPort + 1);
        console.log(`\n⚠️  Port ${apiPort} is already in use.`);
        const useNext = await confirm(`Use port ${nextPort} instead?`, true);
        if (useNext) {
            apiPort = nextPort;
        } else {
            console.log('\n❌ Aborted. Please stop the existing process or choose a different port.');
            console.log(`   lve-chain start --port <number>\n`);
            process.exit(1);
        }
    }

    // Check P2P port availability
    let p2pPort = options.p2pPort;
    if (!(await isPortAvailable(p2pPort))) {
        const nextPort = await findAvailablePort(p2pPort + 1);
        console.log(`\n⚠️  P2P Port ${p2pPort} is already in use.`);
        const useNext = await confirm(`Use port ${nextPort} instead?`, true);
        if (useNext) {
            p2pPort = nextPort;
        } else {
            console.log('\n❌ Aborted. Please stop the existing process or choose a different P2P port.');
            console.log(`   lve-chain start --p2p <number>\n`);
            process.exit(1);
        }
    }

    console.log('');
    logger.info(`🚀 Starting LVE Chain Node...`);
    logger.info(`📁 Data directory: ${options.dataDir}`);
    logger.info(`🌐 Network: ${network}`);
    logger.info(`🔌 P2P Port: ${p2pPort}`);
    if (options.enableApi) {
        logger.info(`🌍 API Port: ${apiPort}`);
    }

    // Initialize node identity (Ed25519 keypair)
    // Identity is stored in network-specific directory
    const identityDir = `${options.dataDir}/${network}`;
    const { initNodeIdentity } = await import('../../identity/index.js');
    const nodeIdentity = await initNodeIdentity(identityDir);
    logger.info(`🔑 Node ID: ${nodeIdentity.getShortId()}`);

    // Show first-run warning if new identity
    await nodeIdentity.showFirstRunWarning();

    // Initialize blockchain
    const blockchain = new Blockchain();
    const savedData = storage.loadBlockchain();

    if (savedData) {
        blockchain.loadFromData(savedData);
        logger.info(`📦 Loaded blockchain: ${blockchain.chain.length} blocks`);
    } else {
        // Use fixed genesis faucet address for network consistency
        const { config: appConfig } = await import('../../config.js');
        blockchain.initialize(appConfig.genesis.faucetAddress);
        storage.saveBlockchain(blockchain.toJSON());
        logger.info(`💧 Genesis faucet address: ${appConfig.genesis.faucetAddress}`);
    }

    // NOTE: Staking state is derived from blockchain transactions (on-chain staking)
    // No staking.json loading - chain is the only source of truth

    // Initialize NFT Manager
    const nftManager = new NFTManager();

    // Initialize P2P server (skip in API-only mode or if role disables P2P)
    const p2pEnabled = roleConfig ? roleConfig.services.p2p !== false : true;
    let p2pServer: P2PServer | null = null;
    if (!options.apiOnlyMode && p2pEnabled) {
        // Pass selfUrl to prevent connecting to ourselves in bootstrap list
        const selfUrls = options.selfUrl ? [options.selfUrl] : [];
        p2pServer = new P2PServer(blockchain, p2pPort, options.bootstrapMode, selfUrls);
        p2pServer.start();

        // Connect to seed node if provided
        if (options.seedNode) {
            logger.info(`🔗 Connecting to seed node: ${options.seedNode}`);
            try {
                await p2pServer.connectToPeer(options.seedNode);
                logger.info(`✅ Connected to seed node`);
            } catch (error) {
                logger.warn(`⚠️ Failed to connect to seed node: ${error}`);
            }
        }
    } else if (roleConfig && !p2pEnabled) {
        logger.info(`🔇 P2P disabled for role: ${roleConfig.name}`);
    } else {
        logger.info(`🌐 API-only mode: P2P disabled, read-only blockchain access`);
    }

    // Start API server if enabled (role-based or explicit flag)
    const apiEnabled = roleConfig ? roleConfig.services.apiServer : options.enableApi;
    if (apiEnabled) {
        const app: Express = express();

        // Trust proxy for nginx/cloudflare (needed for rate limiting behind proxy)
        app.set('trust proxy', 1);

        // Rate limiting
        const apiLimiter = rateLimit({
            windowMs: 60 * 1000,
            max: 100,
            message: { success: false, error: 'Too many requests' },
        });

        // Middleware
        app.use(cors());
        app.use(express.json({ limit: '10mb' }));
        app.use('/api', apiLimiter);

        // Swagger docs
        app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
            customCss: '.swagger-ui .topbar { display: none }',
            customSiteTitle: 'LVE Chain API Docs',
        }));

        // Routes
        app.use('/api/blockchain', createBlockchainRoutes(blockchain));
        app.use('/api/wallet', createWalletRoutes(blockchain));
        app.use('/api/transaction', createTransactionRoutes(blockchain));
        if (p2pServer) {
            app.use('/api/network', createNetworkRoutes(p2pServer));
        }
        app.use('/api/nft', createNFTRoutes(nftManager));
        app.use('/api/ipfs', createIPFSRoutes());
        app.use('/api/staking', createStakingRoutes(blockchain));
        app.use('/api/pool', createPoolRoutes());
        if (p2pServer) {
            app.use('/api/node', createNodeRoutes(blockchain, p2pServer));
        }

        // Health check
        app.get('/health', (_, res) => {
            res.json({
                status: 'ok',
                blocks: blockchain.chain.length,
                peers: p2pServer ? p2pServer.getPeerCount() : 0,
                network: network,
                mode: options.apiOnlyMode ? 'api-only' : 'full-node',
            });
        });

        // Network info
        app.get('/api/network-info', (_, res) => {
            res.json({
                success: true,
                data: {
                    network: config.network_mode,
                    isTestnet: config.isTestnet,
                    symbol: config.blockchain.coinSymbol,
                    addressPrefix: config.blockchain.addressPrefix,
                    faucetEnabled: config.faucet.enabled,
                },
            });
        });

        // Faucet (testnet only)
        const faucetCooldowns: Map<string, number> = new Map();
        app.post('/api/faucet', (req, res) => {
            if (!config.faucet.enabled) {
                res.status(403).json({ success: false, error: 'Faucet is only available on testnet' });
                return;
            }
            const { address, amount = config.faucet.amount } = req.body;
            if (!address) {
                res.status(400).json({ success: false, error: 'Address is required' });
                return;
            }
            const genesisBlock = blockchain.chain[0];
            const genesisAddress = genesisBlock?.transactions[0]?.toAddress;
            if (!genesisAddress) {
                res.status(500).json({ success: false, error: 'Genesis not found' });
                return;
            }
            const balance = blockchain.getBalance(genesisAddress);
            if (balance < amount) {
                res.status(400).json({ success: false, error: 'Faucet is empty' });
                return;
            }
            const lastRequest = faucetCooldowns.get(address);
            const now = Date.now();
            if (lastRequest && now - lastRequest < 60000) {
                const waitSec = Math.ceil((60000 - (now - lastRequest)) / 1000);
                res.status(429).json({ success: false, error: `Wait ${waitSec} seconds before next faucet request` });
                return;
            }
            try {
                const tx = new Transaction(genesisAddress, address, amount, 0);
                const latestBlock = blockchain.getLatestBlock();
                const faucetBlock = new Block(
                    latestBlock.index + 1,
                    Date.now(),
                    [tx],
                    latestBlock.hash,
                    blockchain.difficulty,
                    'FAUCET',
                    'pos'
                );
                faucetBlock.hash = faucetBlock.calculateHash();
                blockchain.chain.push(faucetBlock);
                (blockchain as any).balanceCache?.clear();
                storage.saveBlockchain(blockchain.toJSON());
                faucetCooldowns.set(address, now);
                logger.info(`💧 Faucet: ${amount} ${config.blockchain.coinSymbol} → ${address}`);
                res.json({ success: true, data: { message: `Sent ${amount} ${config.blockchain.coinSymbol}`, transactionId: tx.id, blockIndex: faucetBlock.index } });
            } catch (e) {
                logger.error(`Faucet error: ${e instanceof Error ? e.message : e}`);
                res.status(500).json({ success: false, error: e instanceof Error ? e.message : 'Failed' });
            }
        });

        app.listen(apiPort, () => {
            logger.info(`🌍 API Server running on http://localhost:${apiPort}`);
            logger.info(`📚 Swagger docs: http://localhost:${apiPort}/docs`);
        });
    }

    // Initialize block producer (PoS) - skip in bootstrap mode or if role disables it
    const blockProductionEnabled = roleConfig ? roleConfig.services.blockProduction : true;
    if (!options.bootstrapMode && blockProductionEnabled) {
        // Validator onboarding check
        const rewardAddress = nodeIdentity.getRewardAddress();
        const { chainParams } = await import('../../../protocol/params/index.js');
        const minStake = chainParams.staking.minValidatorSelfStake;

        if (!rewardAddress) {
            console.log('');
            console.log(boxTop());
            console.log(boxCenter('Validator Setup Required'));
            console.log(boxSeparator());
            console.log(boxCenter('No reward address configured!'));
            console.log(boxEmpty());
            console.log(boxCenter('To receive validator rewards, run:'));
            console.log(boxEmpty());
            console.log(boxCenter('1. Generate wallet:'));
            console.log(boxCenter('   lve-chain reward generate'));
            console.log(boxEmpty());
            console.log(boxCenter('2. Or bind existing:'));
            console.log(boxCenter('   lve-chain reward bind <address>'));
            console.log(boxEmpty());
            console.log(boxCenter('Then restart the validator node.'));
            console.log(boxBottom());
            console.log('');
            logger.warn('⚠️ Validator running without reward address - no block production');
        } else {
            // Check current stake
            const stakeAmount = stakingPool.getStake(rewardAddress);
            const shortAddr = `${rewardAddress.slice(0, 12)}...${rewardAddress.slice(-8)}`;

            if (stakeAmount < minStake) {
                console.log('');
                console.log(boxTop());
                console.log(boxCenter('Insufficient Stake'));
                console.log(boxSeparator());
                console.log(boxCenter(`Reward Address: ${shortAddr}`));
                console.log(boxCenter(`Current Stake:  ${stakeAmount} LVE`));
                console.log(boxCenter(`Required:       ${minStake} LVE`));
                console.log(boxEmpty());
                console.log(boxCenter('To become an active validator:'));
                console.log(boxEmpty());
                console.log(boxCenter('1. Get LVE tokens:'));
                console.log(boxCenter('   lve-chain faucet request <address>'));
                console.log(boxEmpty());
                console.log(boxCenter('2. Stake LVE:'));
                console.log(boxCenter('   POST /api/staking/stake'));
                console.log(boxCenter(`   {"address": "...", "amount": ${minStake}}`));
                console.log(boxEmpty());
                console.log(boxCenter('Status: INACTIVE (not producing blocks)'));
                console.log(boxBottom());
                console.log('');
                logger.warn(`⚠️ Stake ${stakeAmount}/${minStake} LVE - validator inactive`);
            } else {
                logger.info(`✅ Validator stake: ${stakeAmount} LVE (min: ${minStake})`);
            }

            // Start block producer regardless (it will check stake internally)
            const blockProducer = initBlockProducer(blockchain);
            blockProducer.start();
            logger.info(`🏭 Block producer started`);
        }
    } else if (roleConfig && !blockProductionEnabled) {
        logger.info(`🔇 Block production disabled for role: ${roleConfig.name}`);
    } else {
        logger.info(`📡 Bootstrap mode: Block production disabled`);
    }

    // NOTE: No staking.json auto-save - state is derived from blockchain only

    logger.info(`\n✅ Node is running!`);
    console.log(`\n📋 Available commands: status, peers, info, help, exit\n`);

    // Interactive REPL
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: 'lve-chain> '
    });

    rl.prompt();

    rl.on('line', async (line) => {
        const cmd = line.trim().toLowerCase();

        switch (cmd) {
            case 'status':
                console.log(`\n📊 Status:`);
                console.log(`   Blocks: ${blockchain.chain.length}`);
                console.log(`   Peers: ${p2pServer ? p2pServer.getPeerCount() : 'N/A (API-only)'}`);
                console.log(`   Pending TX: ${blockchain.pendingTransactions.length}`);
                console.log(`   Network: ${network}\n`);
                break;

            case 'peers':
                if (p2pServer) {
                    console.log(`\n🌐 Connected Peers: ${p2pServer.getPeerCount()}`);
                    p2pServer.getPeers().forEach((peer, i) => {
                        console.log(`   ${i + 1}. ${peer}`);
                    });
                } else {
                    console.log(`\n🌐 P2P disabled in API-only mode`);
                }
                console.log('');
                break;

            case 'info':
                const infoRewardAddr = nodeIdentity.getRewardAddress();
                const infoStake = infoRewardAddr ? stakingPool.getStake(infoRewardAddr) : 0;
                const infoMinStake = 100; // chainParams.staking.minValidatorSelfStake
                const infoRemaining = Math.max(0, infoMinStake - infoStake);
                const infoIsValidator = infoStake >= infoMinStake;

                console.log('');
                console.log(boxTop());
                console.log(boxCenter('Node Info'));
                console.log(boxSeparator());
                console.log(boxCenter(`Network:       ${network}`));
                console.log(boxCenter(`API Port:      ${apiPort}`));
                console.log(boxCenter(`P2P Port:      ${p2pPort}`));
                console.log(boxCenter(`Latest Block:  #${blockchain.getLatestBlock().index}`));
                console.log(boxSeparator());
                console.log(boxCenter('Validator Status'));
                console.log(boxSeparator());
                if (infoRewardAddr) {
                    const shortAddr = `${infoRewardAddr.slice(0, 12)}...${infoRewardAddr.slice(-8)}`;
                    console.log(boxCenter(`Reward Address: ${shortAddr}`));
                    console.log(boxCenter(`Staked:         ${infoStake} LVE`));
                    console.log(boxCenter(`Min Required:   ${infoMinStake} LVE`));
                    if (infoIsValidator) {
                        console.log(boxCenter(`Status:         ACTIVE VALIDATOR`));
                    } else {
                        console.log(boxCenter(`Remaining:      ${infoRemaining} LVE`));
                        console.log(boxCenter(`Status:         INACTIVE`));
                    }
                } else {
                    console.log(boxCenter('Reward Address: Not configured'));
                    console.log(boxCenter('Run: lve-chain reward generate'));
                }
                console.log(boxBottom());
                console.log('');
                break;

            case 'help':
                console.log(`\n📋 Commands:`);
                console.log(`   status  - Show node status`);
                console.log(`   peers   - Show connected peers`);
                console.log(`   info    - Show node configuration`);
                console.log(`   exit    - Stop the node\n`);
                break;

            case 'exit':
            case 'quit':
                console.log('\n👋 Shutting down node...');
                if (p2pServer) p2pServer.close();
                storage.saveBlockchain(blockchain.toJSON());
                console.log('💾 Blockchain saved. Goodbye!\n');
                rl.close();
                process.exit(0);
                break;

            case '':
                break;

            default:
                console.log(`Unknown command: ${cmd}. Type 'help' for available commands.`);
        }

        rl.prompt();
    });

    // Handle graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n👋 Shutting down node...');
        if (p2pServer) p2pServer.close();
        storage.saveBlockchain(blockchain.toJSON());
        console.log('💾 Blockchain saved. Goodbye!');
        rl.close();
        process.exit(0);
    });
}
