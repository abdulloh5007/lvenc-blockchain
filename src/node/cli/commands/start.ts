import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
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
import { c, successBox, infoBox, warningBox } from '../../../protocol/utils/cli.js';
import { getRole, RoleConfig, RoleName } from '../../roles/index.js';
import { loadGenesisConfig } from '../../../protocol/consensus/index.js';
import { chainParams } from '../../../protocol/params/index.js';

import { createBlockchainRoutes } from '../../api/routes/blockchain.js';
import { createWalletRoutes } from '../../api/routes/wallet.js';
import { createTransactionRoutes } from '../../api/routes/transaction.js';
import { createNetworkRoutes } from '../../api/routes/network.js';
import { createNFTRoutes } from '../../api/routes/nft.js';
import { createIPFSRoutes } from '../../api/routes/ipfs.js';
import { createStakingRoutes } from '../../api/routes/staking.js';
import { createNodeRoutes } from '../../api/routes/node.js';
import { createPoolRoutes } from '../../api/routes/pool.js';
import { createFaucetRoutes } from '../../api/routes/faucet.js';

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
    const banner = [
        '██╗     ██╗   ██╗███████╗███╗   ██╗ ██████╗',
        '██║     ██║   ██║██╔════╝████╗  ██║██╔════╝',
        '██║     ██║   ██║█████╗  ██╔██╗ ██║██║     ',
        '██║     ╚██╗ ██╔╝██╔══╝  ██║╚██╗██║██║     ',
        '███████╗ ╚████╔╝ ███████╗██║ ╚████║╚██████╗',
        '╚══════╝  ╚═══╝  ╚══════╝╚═╝  ╚═══╝ ╚═════╝',
    ].join('\n');
    console.log(infoBox(banner, versionLine));
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
        console.log(`\n⚠  Port ${apiPort} is already in use.`);
        const useNext = await confirm(`Use port ${nextPort} instead?`, true);
        if (useNext) {
            apiPort = nextPort;
        } else {
            console.log('\n✗ Aborted. Please stop the existing process or choose a different port.');
            console.log(`   lve-chain start --port <number>\n`);
            process.exit(1);
        }
    }

    // Check P2P port availability
    let p2pPort = options.p2pPort;
    if (!(await isPortAvailable(p2pPort))) {
        const nextPort = await findAvailablePort(p2pPort + 1);
        console.log(`\n⚠  P2P Port ${p2pPort} is already in use.`);
        const useNext = await confirm(`Use port ${nextPort} instead?`, true);
        if (useNext) {
            p2pPort = nextPort;
        } else {
            console.log('\n✗ Aborted. Please stop the existing process or choose a different P2P port.');
            console.log(`   lve-chain start --p2p <number>\n`);
            process.exit(1);
        }
    }

    console.log('');
    logger.info(`● Starting LVE Chain Node...`);
    logger.info(`📁 Data directory: ${options.dataDir}`);
    logger.info(`🌐 Network: ${network}`);
    logger.info(`🔌 P2P Port: ${p2pPort}`);
    if (options.enableApi) {
        logger.info(`🌍 API Port: ${apiPort}`);
    }

    // Initialize unified node identity (Ed25519 keypair with mnemonic)
    // This is used for: P2P, block signing, staking address
    const identityDir = options.dataDir;
    const { initUnifiedIdentity, getUnifiedIdentity } = await import('../../identity/index.js');
    const nodeIdentity = await initUnifiedIdentity(identityDir);
    logger.info(`🔑 Node ID: ${nodeIdentity.getShortAddress()}`);

    // Show mnemonic warning for new identity (CRITICAL!)
    await nodeIdentity.showFirstRunWarning();

    // Log validator address for staking
    if (roleConfig?.name === 'validator') {
        logger.info(`💰 Validator address: ${nodeIdentity.getFullAddress()}`);
    }

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
        logger.info(`● Genesis faucet address: ${appConfig.genesis.faucetAddress}`);
    }

    // Load genesis validators into StakingPool (critical for block production)
    const genesisConfig = loadGenesisConfig(options.dataDir);
    let isGenesisValidator = false;
    let genesisRewardAddress: string | null = null;

    if (genesisConfig && genesisConfig.validators.length > 0) {
        stakingPool.loadGenesisValidators(genesisConfig.validators);
        logger.info(`🌱 Loaded ${genesisConfig.validators.length} genesis validator(s)`);

        // Check if THIS node is a genesis validator using UnifiedIdentity pubkey
        const nodePubKey = nodeIdentity.getPubKey();
        const matchingValidator = genesisConfig.validators.find(
            v => v.consensusPubKey === nodePubKey
        );
        if (matchingValidator) {
            isGenesisValidator = true;
            genesisRewardAddress = matchingValidator.operatorAddress;
            const validatorName = matchingValidator.moniker || 'Genesis Validator';
            logger.info(`🎯 Node is genesis validator: ${validatorName}`);
        }
    }

    // Subscribe to staking changes to show real-time updates for THIS node
    const myRewardAddress = nodeIdentity.getRewardAddress();
    blockchain.onStakingChange = (address, type, amount) => {
        // Only show detailed info if it's OUR address
        if (address === myRewardAddress) {
            const totalStake = stakingPool.getStake(address);
            const minRequired = 100; // chainParams.staking.minValidatorSelfStake
            const isActive = totalStake >= minRequired;
            const statusIcon = isActive ? '🟢' : '🟡';
            const statusText = isActive ? 'ACTIVE VALIDATOR' : `Need ${minRequired - totalStake} more LVE`;

            console.log('');
            console.log(`${statusIcon} YOUR NODE STAKING UPDATE:`);
            console.log(`   ${type === 'STAKE' ? '⬆️' : '⬇️'} ${type}: ${type === 'UNSTAKE' ? '-' : '+'}${amount} LVE`);
            console.log(`   📊 Total Stake: ${totalStake} LVE`);
            console.log(`   📋 Status: ${statusText}`);
            console.log('');
        }
    };

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
                logger.info(`✓ Connected to seed node`);
            } catch (error) {
                logger.warn(`⚠ Failed to connect to seed node: ${error}`);
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
        app.use('/api/faucet', createFaucetRoutes());
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
                    chainId: config.chainId,
                },
            });
        });

        // Nonce endpoint for transaction replay protection
        const { nonceManager } = await import('../../../protocol/security/nonce-manager.js');
        app.get('/api/nonce/:address', (req, res) => {
            const { address } = req.params;
            if (!address) {
                res.status(400).json({ success: false, error: 'Address is required' });
                return;
            }
            const nonceInfo = nonceManager.getNonceInfo(address);
            res.json({
                success: true,
                data: {
                    address,
                    lastNonce: nonceInfo.lastNonce,
                    nextNonce: nonceInfo.nextNonce,
                    pendingCount: nonceInfo.pendingCount,
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
                    0, // difficulty 0 for PoS
                    'FAUCET',
                    'pos'
                );
                faucetBlock.hash = faucetBlock.calculateHash();
                blockchain.chain.push(faucetBlock);
                (blockchain as any).balanceCache?.clear();
                storage.saveBlockchain(blockchain.toJSON());
                faucetCooldowns.set(address, now);
                logger.info(`● Faucet: ${amount} ${config.blockchain.coinSymbol} → ${address}`);
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
        // Genesis validators start immediately - no stake check needed
        if (isGenesisValidator && genesisRewardAddress) {
            logger.info(`✓ Genesis validator ready (power from genesis.json)`);
            blockchain.markAsSynced();  // Genesis node is always synced (it IS the chain)
            const blockProducer = initBlockProducer(blockchain);
            blockProducer.start();
            logger.info(`🏭 Block producer started`);
        } else {
            // Non-genesis validators need stake
            const rewardAddress = nodeIdentity.getRewardAddress();
            const { chainParams } = await import('../../../protocol/params/index.js');
            const minStake = chainParams.staking.minValidatorSelfStake;

            if (!rewardAddress) {
                console.log('');
                console.log(warningBox(
                    'No reward address configured!\n\n' +
                    'To receive validator rewards, run:\n\n' +
                    '1. Generate wallet:\n' +
                    '   lve-chain reward generate\n\n' +
                    '2. Or bind existing:\n' +
                    '   lve-chain reward bind <address>\n\n' +
                    'Then restart the validator node.',
                    '⚠️ Validator Setup Required'
                ));
                console.log('');
                logger.warn('⚠ Validator running without reward address - no block production');
            } else {
                // Check current stake
                const stakeAmount = stakingPool.getStake(rewardAddress);
                const shortAddr = `${rewardAddress.slice(0, 12)}...${rewardAddress.slice(-8)}`;

                if (stakeAmount < minStake) {
                    console.log('');
                    console.log(warningBox(
                        `Reward Address: ${shortAddr}\n` +
                        `Current Stake:  ${stakeAmount} LVE\n` +
                        `Required:       ${minStake} LVE\n\n` +
                        'To become an active validator:\n\n' +
                        '1. Get LVE tokens:\n' +
                        '   lve-chain faucet request <address>\n\n' +
                        '2. Stake LVE:\n' +
                        '   POST /api/staking/stake\n' +
                        `   {"address": "...", "amount": ${minStake}}\n\n` +
                        'Status: INACTIVE (not producing blocks)',
                        '⚠️ Insufficient Stake'
                    ));
                    console.log('');
                    logger.warn(`⚠ Stake ${stakeAmount}/${minStake} LVE - validator inactive`);
                } else {
                    logger.info(`✓ Validator stake: ${stakeAmount} LVE (min: ${minStake})`);
                }

                // Start block producer regardless (it will check stake internally)
                const blockProducer = initBlockProducer(blockchain);
                blockProducer.start();
                logger.info(`🏭 Block producer started`);
            }
        }
    } else if (roleConfig && !blockProductionEnabled) {
        logger.info(`🔇 Block production disabled for role: ${roleConfig.name}`);
    } else {
        logger.info(`📡 Bootstrap mode: Block production disabled`);
    }

    // NOTE: No staking.json auto-save - state is derived from blockchain only

    logger.info(`\n✓ Node is running!`);

    // === REAL-TIME NOTIFICATIONS ===
    const identityPath = path.join(options.dataDir, 'identity.key');
    let lastRewardAddress: string | null = null;
    let lastValidatorStatus = { isActive: false, stake: 0 };

    // Load initial reward address
    try {
        if (fs.existsSync(identityPath)) {
            const data = JSON.parse(fs.readFileSync(identityPath, 'utf-8'));
            lastRewardAddress = data.rewardAddress || null;
        }
    } catch { /* ignore */ }

    // Watch identity.key for changes (reward bind)
    if (fs.existsSync(identityPath)) {
        fs.watch(identityPath, (eventType: fs.WatchEventType) => {
            if (eventType === 'change') {
                try {
                    const data = JSON.parse(fs.readFileSync(identityPath, 'utf-8'));
                    if (data.rewardAddress && data.rewardAddress !== lastRewardAddress) {
                        logger.info(`🎯 Reward address bound: ${data.rewardAddress}`);
                        lastRewardAddress = data.rewardAddress;
                    }
                } catch { /* ignore parse errors */ }
            }
        });
    }

    // Periodic validator status check (every 10 seconds)
    // Use unified identity for address
    if (roleConfig?.name === 'validator') {
        const myAddress = nodeIdentity.getFullAddress();
        setInterval(() => {
            const stake = stakingPool.getStake(myAddress);
            const pendingStake = stakingPool.getPendingStake(myAddress);
            const validators = stakingPool.getValidators();
            const isActive = validators.some(v => v.address === myAddress);
            const MIN_STAKE = chainParams.staking.minValidatorSelfStake;

            // Calculate VRF chances if active
            let vrfChance = 0;
            if (isActive && stake > 0) {
                const totalStake = validators
                    .filter(v => v.isActive)
                    .reduce((sum, v) => sum + (stakingPool.getStake(v.address) || 0), 0);
                if (totalStake > 0) {
                    vrfChance = Math.round((stake / totalStake) * 100);
                }
            }

            // Check for stake changes
            if (stake !== lastValidatorStatus.stake) {
                if (stake > lastValidatorStatus.stake) {
                    logger.info(`💰 Stake updated: ${lastValidatorStatus.stake} → ${stake} LVE`);
                } else if (stake < lastValidatorStatus.stake) {
                    logger.info(`📉 Stake decreased: ${lastValidatorStatus.stake} → ${stake} LVE`);
                }

                if (stake < MIN_STAKE && stake > 0) {
                    logger.info(`⚠️ Need ${MIN_STAKE - stake} more LVE to become validator`);
                } else if (stake >= MIN_STAKE && isActive) {
                    logger.info(`📊 VRF selection chance: ~${vrfChance}%`);
                }
                lastValidatorStatus.stake = stake;
            }

            // Check for pending stake
            if (pendingStake > 0) {
                logger.info(`⏳ Pending stake: ${pendingStake} LVE (activates next epoch)`);
            }

            // Check for validator activation
            if (isActive && !lastValidatorStatus.isActive) {
                logger.info(`🎉 YOU ARE NOW AN ACTIVE VALIDATOR! Stake: ${stake} LVE (~${vrfChance}% VRF chance)`);
                lastValidatorStatus.isActive = true;
            } else if (!isActive && lastValidatorStatus.isActive) {
                logger.warn(`⚠️ No longer active validator. Stake: ${stake} LVE`);
                lastValidatorStatus.isActive = false;
            }
        }, 10000);
    }

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
                console.log(`\n● Status:`);
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
                let nodeInfoContent =
                    `Network:       ${network}\n` +
                    `API Port:      ${apiPort}\n` +
                    `P2P Port:      ${p2pPort}\n` +
                    `Latest Block:  #${blockchain.getLatestBlock().index}\n\n` +
                    '─── Validator Status ───\n';

                if (infoRewardAddr) {
                    const shortAddr = `${infoRewardAddr.slice(0, 12)}...${infoRewardAddr.slice(-8)}`;
                    nodeInfoContent += `Reward Address: ${shortAddr}\n`;
                    nodeInfoContent += `Staked:         ${infoStake} LVE\n`;
                    nodeInfoContent += `Min Required:   ${infoMinStake} LVE\n`;
                    if (infoIsValidator) {
                        nodeInfoContent += `Status:         ACTIVE VALIDATOR`;
                    } else {
                        nodeInfoContent += `Remaining:      ${infoRemaining} LVE\n`;
                        nodeInfoContent += `Status:         INACTIVE`;
                    }
                } else {
                    nodeInfoContent += 'Reward Address: Not configured\n';
                    nodeInfoContent += 'Run: lve-chain reward generate';
                }
                console.log(infoBox(nodeInfoContent, 'ℹ️ Node Info'));
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
