import express, { Express, Request, Response, NextFunction, Router } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './swagger.js';
import { config } from '../config.js';
import { Blockchain } from '../blockchain/index.js';
import { P2PServer } from '../network/index.js';
import { storage } from '../storage/index.js';
import { Wallet } from '../wallet/index.js';
import { logger } from '../utils/logger.js';

import { createBlockchainRoutes } from './routes/blockchain.js';
import { createWalletRoutes } from './routes/wallet.js';
import { createTransactionRoutes } from './routes/transaction.js';
import { createMiningRoutes } from './routes/mining.js';
import { createNetworkRoutes } from './routes/network.js';
import { createNFTRoutes } from './routes/nft.js';
import { createIPFSRoutes } from './routes/ipfs.js';
import { createAdminRoutes } from './routes/admin.js';
import { apiKeyAuth } from './middleware/index.js';
import { NFTManager } from '../nft/index.js';

// Initialize blockchain
const blockchain = new Blockchain();

// Try to load existing blockchain from storage
const savedData = storage.loadBlockchain();
if (savedData) {
    blockchain.loadFromData(savedData);
} else {
    // Create faucet wallet and genesis block
    const faucetWallet = new Wallet(undefined, 'Faucet');
    storage.saveWallet(faucetWallet.export());
    blockchain.initialize(faucetWallet.address);
    storage.saveBlockchain(blockchain.toJSON());
    logger.info(`💧 Faucet wallet created: ${faucetWallet.address}`);
}

// Initialize NFT Manager
const nftManager = new NFTManager();

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
app.use(cors(config.api.cors));
app.use(express.json({ limit: '5mb' })); // Increased for IPFS uploads
app.use(apiLimiter);

// Request logging
app.use((req: Request, _res: Response, next: NextFunction) => {
    logger.debug(`${req.method} ${req.path}`);
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

// API Info
app.get('/api', (_req: Request, res: Response) => {
    res.json({
        success: true,
        data: {
            name: 'EDU Chain API',
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
    customSiteTitle: 'EDU Chain API Docs',
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
v1Router.use('/mining', createMiningRoutes(blockchain));
v1Router.use('/network', createNetworkRoutes(p2pServer));
v1Router.use('/nft', createNFTRoutes(nftManager));
v1Router.use('/ipfs', createIPFSRoutes());

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
app.use('/api/mining', createMiningRoutes(blockchain));
app.use('/api/network', createNetworkRoutes(p2pServer));
app.use('/api/nft', createNFTRoutes(nftManager));
app.use('/api/ipfs', createIPFSRoutes());

// Faucet endpoint - get free coins for testing
app.post('/api/faucet', (req: Request, res: Response) => {
    const { address } = req.body;
    const amount = 100; // Free 100 coins

    if (!address) {
        res.status(400).json({
            success: false,
            error: 'Address is required',
        });
        return;
    }

    // Find faucet wallet
    const wallets = storage.listWallets();
    const faucetData = wallets.find(w => w.label === 'Faucet');

    if (!faucetData) {
        res.status(500).json({
            success: false,
            error: 'Faucet wallet not found',
        });
        return;
    }

    const faucetWallet = Wallet.import(faucetData);
    const faucetBalance = blockchain.getBalance(faucetWallet.address);

    if (faucetBalance < amount) {
        res.status(400).json({
            success: false,
            error: 'Faucet is empty. Mine some blocks first!',
        });
        return;
    }

    try {
        const tx = faucetWallet.createTransaction(address, amount);
        blockchain.addTransaction(tx);
        storage.saveBlockchain(blockchain.toJSON());

        res.json({
            success: true,
            data: {
                message: `Sent ${amount} EDU to ${address}`,
                transactionId: tx.id,
            },
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Faucet failed',
        });
    }
});

// V1 Faucet
v1Router.post('/faucet', (req: Request, res: Response) => {
    const { address } = req.body;
    const amount = 100;

    if (!address) {
        res.status(400).json({ success: false, error: 'Address is required' });
        return;
    }

    const wallets = storage.listWallets();
    const faucetData = wallets.find(w => w.label === 'Faucet');

    if (!faucetData) {
        res.status(500).json({ success: false, error: 'Faucet wallet not found' });
        return;
    }

    const faucetWallet = Wallet.import(faucetData);
    const faucetBalance = blockchain.getBalance(faucetWallet.address);

    if (faucetBalance < amount) {
        res.status(400).json({ success: false, error: 'Faucet is empty' });
        return;
    }

    try {
        const tx = faucetWallet.createTransaction(address, amount);
        blockchain.addTransaction(tx);
        storage.saveBlockchain(blockchain.toJSON());
        res.json({
            success: true,
            data: { message: `Sent ${amount} EDU to ${address}`, transactionId: tx.id },
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Faucet failed',
        });
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
