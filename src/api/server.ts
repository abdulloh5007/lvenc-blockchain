import 'dotenv/config';
import express, { Express, Request, Response, NextFunction, Router } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './swagger.js';
import { config } from '../config.js';
import { Blockchain, Transaction, Block } from '../blockchain/index.js';
import { P2PServer } from '../network/index.js';
import { storage } from '../storage/index.js';
import { Wallet } from '../wallet/index.js';
import { logger } from '../utils/logger.js';

import { createBlockchainRoutes } from './routes/blockchain.js';
import { createWalletRoutes } from './routes/wallet.js';
import { createTransactionRoutes } from './routes/transaction.js';
import { createNetworkRoutes } from './routes/network.js';
import { createNFTRoutes } from './routes/nft.js';
import { createIPFSRoutes } from './routes/ipfs.js';
import { createAdminRoutes } from './routes/admin.js';
import { createStakingRoutes } from './routes/staking.js';
import { createNodeRoutes } from './routes/node.js';
import { createPoolRoutes } from './routes/pool.js';
import { initBlockProducer, stakingPool } from '../staking/index.js';
import {
    apiKeyAuth,
    inputValidation,
    securityHeaders,
    bruteForceProtection,
    csrfProtection,
    csrfTokenHandler,
    sessionSecurity,
    jsonDepthLimiter,
    connectionTimeout,
    checkRpcLimit
} from './middleware/index.js';
import { NFTManager } from '../nft/index.js';

// Initialize blockchain
const blockchain = new Blockchain();
// Try to load existing blockchain from storage
const savedData = storage.loadBlockchain();
if (savedData) {
    blockchain.loadFromData(savedData);
} else {
    // Use fixed genesis faucet address for network consistency
    blockchain.initialize(config.genesis.faucetAddress);
    storage.saveBlockchain(blockchain.toJSON());
    logger.info(`💧 Genesis faucet address: ${config.genesis.faucetAddress}`);
}
// Load staking data
const savedStaking = storage.loadStaking();
if (savedStaking) {
    stakingPool.loadFromData(savedStaking);
    logger.info(`📊 Loaded staking data: ${savedStaking.stakes?.length || 0} stakers`);
}

// Initialize NFT Manager
const nftManager = new NFTManager();

// Initialize Node Identity
import { initNodeIdentity } from '../identity/index.js';
const nodeIdentity = await initNodeIdentity();
if (nodeIdentity.isNew()) {
    logger.warn('⚠️ New node identity generated. Backup your identity.key file!');
}
logger.info(`🔑 Node ID: ${nodeIdentity.getShortId()}`);

// Initialize P2P server
const p2pServer = new P2PServer(blockchain, config.network.p2pPort);
p2pServer.start();

// Create Express app
const app: Express = express();

// Rate limiting
const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: 'Too many requests, please try again later.',
    },
});

const mintLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 mints per minute
    message: {
        success: false,
        error: 'Minting rate limit exceeded. Please wait.',
    },
});

// Middleware
// Trust proxy for nginx reverse proxy (needed for rate limiting behind nginx)
app.set('trust proxy', 1);
app.use(cors(config.api.cors));
app.use(express.json({ limit: '5mb' })); // Increased for IPFS uploads
app.use(apiLimiter);

// Security middleware - protects against various attacks
app.use(securityHeaders);       // XSS, Clickjacking, CSP headers
app.use(inputValidation);       // Injection attack protection
app.use(bruteForceProtection);  // Brute force / credential stuffing protection
app.use(sessionSecurity);       // Session fixation protection
app.use(csrfProtection);        // CSRF protection for browser requests

// DoS protection middleware
app.use(jsonDepthLimiter(10));     // Prevent deeply nested JSON attacks
app.use(connectionTimeout(30000)); // Slowloris protection (30s timeout)

// RPC method rate limiting
app.use((req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const method = `${req.method}:${req.path.split('/')[2] || 'root'}`;
    if (!checkRpcLimit(ip, method)) {
        res.status(429).json({ success: false, error: 'RPC method rate limit exceeded' });
        return;
    }
    next();
});

// Request logging
app.use((req: Request, _res: Response, next: NextFunction) => {
    logger.debug(`${req.method} ${req.path}`);
    if (req.method === 'POST' || req.method === 'PUT') {
        logger.debug(`Body: ${JSON.stringify(req.body)}`);
    }
    next();
});

// Health check
app.get('/health', (_req: Request, res: Response) => {
    res.json({
        success: true,
        data: {
            status: 'healthy',
            version: '1.0.0',
            uptime: process.uptime(),
            timestamp: Date.now(),
        },
    });
});

// CSRF token endpoint for browser clients
app.get('/api/csrf-token', csrfTokenHandler);

// API Info
app.get('/api', (_req: Request, res: Response) => {
    res.json({
        success: true,
        data: {
            name: 'LVE Chain API',
            version: '1.0.0',
            endpoints: {
                v1: '/api/v1',
                legacy: '/api',
            },
            documentation: '/api/docs',
        },
    });
});

// Swagger Documentation
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'LVE Chain API Docs',
}));

// JSON spec endpoint
app.get('/api/docs.json', (_req: Request, res: Response) => {
    res.json(swaggerSpec);
});

// ==========================================
// V1 API Router (versioned)
// ==========================================
const v1Router = Router();

v1Router.use('/blockchain', createBlockchainRoutes(blockchain));
v1Router.use('/wallet', createWalletRoutes(blockchain));
v1Router.use('/transaction', createTransactionRoutes(blockchain));
v1Router.use('/network', createNetworkRoutes(p2pServer));
v1Router.use('/nft', createNFTRoutes(nftManager));
v1Router.use('/ipfs', createIPFSRoutes());
v1Router.use('/staking', createStakingRoutes(blockchain));
v1Router.use('/node', createNodeRoutes(blockchain, p2pServer));
v1Router.use('/pool', createPoolRoutes());

// Apply mint rate limit to NFT mint endpoint
v1Router.post('/nft/mint', mintLimiter);

// Admin routes (API Key protected)
v1Router.use('/admin', apiKeyAuth, createAdminRoutes(blockchain));

// Mount V1 API
app.use('/api/v1', v1Router);

// ==========================================
// Legacy API (backwards compatibility)
// ==========================================
app.use('/api/blockchain', createBlockchainRoutes(blockchain));
app.use('/api/wallet', createWalletRoutes(blockchain));
app.use('/api/transaction', createTransactionRoutes(blockchain));
app.use('/api/network', createNetworkRoutes(p2pServer));
app.use('/api/nft', createNFTRoutes(nftManager));
app.use('/api/ipfs', createIPFSRoutes());
app.use('/api/staking', createStakingRoutes(blockchain));
app.use('/api/pool', createPoolRoutes());
app.get('/api/network-info', (_req: Request, res: Response) => {
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
app.post('/api/faucet', (req: Request, res: Response) => {
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
    // Rate limit: 1 faucet request per address per minute
    const faucetCooldowns: Map<string, number> = (global as any).__faucetCooldowns || new Map();
    (global as any).__faucetCooldowns = faucetCooldowns;
    const lastRequest = faucetCooldowns.get(address);
    const now = Date.now();
    if (lastRequest && now - lastRequest < 60000) {
        const waitSec = Math.ceil((60000 - (now - lastRequest)) / 1000);
        res.status(429).json({ success: false, error: `Wait ${waitSec} seconds before next faucet request` });
        return;
    }
    try {
        const tx = new Transaction(genesisAddress, address, amount, 0);
        // Create instant block for faucet (bypass pending pool - solves bootstrap problem)
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
        // Invalidate balance cache
        (blockchain as any).balanceCache?.clear();
        storage.saveBlockchain(blockchain.toJSON());
        faucetCooldowns.set(address, now);
        logger.info(`💧 Faucet: ${amount} ${config.blockchain.coinSymbol} → ${address} (instant block #${faucetBlock.index})`);
        res.json({ success: true, data: { message: `Sent ${amount} ${config.blockchain.coinSymbol}`, transactionId: tx.id, blockIndex: faucetBlock.index } });
    } catch (e) {
        logger.error(`Faucet error: ${e instanceof Error ? e.message : e}`);
        res.status(500).json({ success: false, error: e instanceof Error ? e.message : 'Failed' });
    }
});


// 404 handler
app.use((_req: Request, res: Response) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
    });
});

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('Server error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
    });
});

// Start server
const PORT = config.network.apiPort;
app.listen(PORT, () => {
    logger.info(`🚀 API Server running on http://localhost:${PORT}`);
    logger.info(`📊 API v1 available at /api/v1`);
    logger.info(`📊 Blockchain stats:`, blockchain.getStats());
    // Start PoS Block Producer
    const blockProducer = initBlockProducer(blockchain);
    blockProducer.start();
});

// Auto-save blockchain periodically
setInterval(() => {
    storage.saveBlockchain(blockchain.toJSON());
}, 60000); // Every minute

// Graceful shutdown
process.on('SIGINT', () => {
    logger.info('Shutting down...');
    storage.saveBlockchain(blockchain.toJSON());
    p2pServer.close();
    process.exit(0);
});

export { app, blockchain, p2pServer };
