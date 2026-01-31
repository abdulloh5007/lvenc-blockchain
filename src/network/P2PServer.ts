/**
 * P2P Server
 * Main WebSocket server orchestrator - delegates to specialized modules
 */

import WebSocket, { WebSocketServer, RawData } from 'ws';
import * as fs from 'fs';
import * as path from 'path';
import { Blockchain, Block, Transaction } from '../protocol/blockchain/index.js';
import { logger } from '../protocol/utils/logger.js';
import { config } from '../node/config.js';

// Modules
import { MessageType, P2PMessage, HandshakeData, ChunkSyncRequest, ChunkSyncResponse, VersionRejectData, VersionErrorCode } from './types.js';
import { BOOTSTRAP_NODES, PEER_MAINTENANCE_INTERVAL_MS, RECONNECT_INTERVAL_MS, MIN_PEERS } from './constants.js';
import { PeerManager, PeerDiscovery } from './peers/index.js';
import { HandshakeHandler } from './protocol/index.js';
import { BlockSync } from './sync/index.js';

// Types are exported from ./types.js directly

export class P2PServer {
    private server: WebSocketServer | null = null;
    private blockchain: Blockchain;
    private port: number;
    private bootstrapMode: boolean;

    // Modules
    private peerManager: PeerManager;
    private discovery: PeerDiscovery;
    private handshake: HandshakeHandler;
    private blockSync: BlockSync;

    // Protocol info
    private chainId: string;
    private genesisHash: string;

    constructor(blockchain: Blockchain, port: number = 6001, bootstrapMode: boolean = false, selfUrls: string[] = []) {
        this.blockchain = blockchain;
        this.port = port;
        this.bootstrapMode = bootstrapMode;

        // Init protocol info
        this.chainId = config.isTestnet ? 'testnet' : 'mainnet';
        this.genesisHash = blockchain.chain[0]?.hash || '';

        // Init modules
        this.peerManager = new PeerManager();
        // Pass selfUrls to prevent connecting to ourselves in bootstrap
        this.discovery = new PeerDiscovery(this.peerManager, this.connectToPeer.bind(this), selfUrls);
        this.handshake = new HandshakeHandler(this.chainId, this.genesisHash);
        this.blockSync = new BlockSync(blockchain, this.broadcast.bind(this));
    }

    // ==================== SERVER LIFECYCLE ====================

    start(): void {
        this.server = new WebSocketServer({ port: this.port });

        this.server.on('connection', (socket, req) => {
            const ip = PeerManager.getClientIP(req);
            this.handleIncomingConnection(socket, ip);
        });

        this.server.on('error', (error) => {
            logger.error('WebSocket server error:', error);
        });

        logger.info(`🌐 P2P Server listening on port ${this.port}`);

        // Connect to bootstrap nodes
        this.connectToBootstrap();

        // Start peer maintenance
        setInterval(() => this.maintainPeers(), PEER_MAINTENANCE_INTERVAL_MS);
        setInterval(() => this.peerManager.cleanupExpiredBans(), 60000);

        // Blockchain events
        this.blockchain.onBlockMined = (block) => {
            logger.info(`📢 Broadcasting block ${block.index}`);
            this.broadcast({ type: MessageType.NEW_BLOCK, data: block.toJSON() });
        };

        this.blockchain.onTransactionAdded = (tx) => {
            this.broadcast({ type: MessageType.NEW_TRANSACTION, data: tx.toJSON() });
        };
    }

    // ==================== CONNECTION HANDLING ====================

    private handleIncomingConnection(socket: WebSocket, ip: string): void {
        // Security checks
        if (this.peerManager.isIPBanned(ip)) {
            socket.close();
            return;
        }

        if (!this.peerManager.canAcceptFromIP(ip)) {
            logger.warn(`⚠️ Too many connections from IP ${ip}`);
            socket.close();
            return;
        }

        const subnet = PeerManager.getSubnet(ip);
        if (!this.peerManager.canAcceptFromSubnet(subnet)) {
            logger.warn(`⚠️ Too many connections from subnet ${subnet}`);
            socket.close();
            return;
        }

        // Add peer
        this.peerManager.addPeer(socket, {
            url: `ws://${ip}`,
            ip,
            subnet,
            verified: false,
        });

        logger.info(`🔗 New peer connected from ${ip}. Total peers: ${this.peerManager.getPeerCount()}`);

        // Set up handlers
        socket.on('message', (data) => this.handleMessage(socket, data));
        socket.on('close', () => this.handleDisconnect(socket));
        socket.on('error', (err) => {
            logger.error('Socket error:', err);
            this.peerManager.adjustScore(socket, -10);
        });

        // Send handshake
        this.send(socket, {
            type: MessageType.HANDSHAKE,
            data: this.handshake.createHandshakeData(this.blockchain.chain.length - 1),
        });
    }

    private handleDisconnect(socket: WebSocket): void {
        const peer = this.peerManager.getPeer(socket);
        if (peer) {
            logger.info(`👋 Peer disconnected: ${peer.url}`);
            this.discovery.removeKnownPeer(peer.url);
        }
        this.peerManager.removePeer(socket);
    }

    // ==================== MESSAGE HANDLING ====================

    private handleMessage(socket: WebSocket, rawData: RawData): void {
        const peer = this.peerManager.getPeer(socket);
        if (!peer) return;

        try {
            const message: P2PMessage = JSON.parse(rawData.toString());

            // Bootstrap mode filter
            if (this.bootstrapMode) {
                const allowed = [MessageType.HANDSHAKE, MessageType.HANDSHAKE_ACK, MessageType.QUERY_PEERS, MessageType.RESPONSE_PEERS];
                if (!allowed.includes(message.type)) {
                    logger.debug(`📡 Bootstrap mode: ignoring ${message.type}`);
                    return;
                }
            }

            // Route message
            switch (message.type) {
                case MessageType.HANDSHAKE:
                    this.handleHandshake(socket, message.data as HandshakeData);
                    break;

                case MessageType.HANDSHAKE_ACK:
                    peer.verified = true;
                    break;

                case MessageType.QUERY_LATEST:
                    this.send(socket, {
                        type: MessageType.RESPONSE_BLOCKCHAIN,
                        data: [this.blockchain.getLatestBlock().toJSON()],
                    });
                    break;

                case MessageType.QUERY_ALL:
                    this.send(socket, {
                        type: MessageType.RESPONSE_BLOCKCHAIN,
                        data: this.blockchain.chain.map(b => b.toJSON()),
                    });
                    break;

                case MessageType.RESPONSE_BLOCKCHAIN:
                    this.blockSync.handleBlockchainResponse(message.data as unknown[]);
                    break;

                case MessageType.NEW_BLOCK:
                    this.blockSync.handleNewBlock(message.data);
                    this.peerManager.adjustScore(socket, 3);
                    break;

                case MessageType.NEW_TRANSACTION:
                    this.handleNewTransaction(message.data);
                    this.peerManager.adjustScore(socket, 1);
                    break;

                case MessageType.QUERY_PEERS:
                    this.discovery.handlePeersQuery(socket, (msg) => this.send(socket, msg));
                    break;

                case MessageType.RESPONSE_PEERS:
                    this.discovery.handlePeersResponse(message.data as string[]);
                    break;

                case MessageType.QUERY_BLOCKS_FROM:
                    this.blockSync.handleQueryBlocksFrom(socket, message.data as ChunkSyncRequest, (msg) => this.send(socket, msg));
                    break;

                case MessageType.RESPONSE_BLOCKS:
                    this.blockSync.handleResponseBlocks(message.data as ChunkSyncResponse);
                    this.peerManager.adjustScore(socket, 5);
                    break;

                case MessageType.VERSION_REJECT:
                    this.handshake.handleVersionReject(message.data as VersionRejectData);
                    break;

                case MessageType.QUERY_GENESIS:
                    this.handleQueryGenesis(socket);
                    break;

                case MessageType.RESPONSE_GENESIS:
                    this.handleGenesisResponse(message.data);
                    break;
            }
        } catch (error) {
            logger.error('Failed to parse message:', error);
            this.peerManager.adjustScore(socket, -5);
        }
    }

    private handleHandshake(socket: WebSocket, data: HandshakeData): void {
        const peer = this.peerManager.getPeer(socket);
        if (!peer) return;

        const currentBlockHeight = this.blockchain.chain.length - 1;
        const result = this.handshake.verifyHandshake(
            data,
            peer.ip,
            currentBlockHeight,
            (rejectData: VersionRejectData) => {
                this.send(socket, { type: MessageType.VERSION_REJECT, data: rejectData });
            }
        );

        if (!result.verified) {
            // AUTO-SYNC GENESIS: If mismatch and we are fresh (height 0 or 1), try to sync genesis
            if (result.error === VersionErrorCode.ERR_GENESIS_MISMATCH) {
                const isFresh = currentBlockHeight <= 1;
                if (isFresh && config.version.protocolVersion >= data.minProtocolVersion) {
                    logger.info('✨ Detected Genesis Mismatch on fresh node. Attempting to sync genesis from peer...');
                    this.send(socket, { type: MessageType.QUERY_GENESIS, data: null });
                    return; // Don't close socket
                }
            }

            socket.close();
            return;
        }

        peer.verified = true;
        this.peerManager.adjustScore(socket, 10);

        // Send acknowledgment and request data
        this.send(socket, { type: MessageType.HANDSHAKE_ACK, data: null });
        this.send(socket, { type: MessageType.QUERY_LATEST, data: null });
        this.send(socket, { type: MessageType.QUERY_PEERS, data: null });
    }

    private handleNewTransaction(data: unknown): void {
        try {
            const tx = Transaction.fromJSON(data as any);
            if (!this.blockchain.pendingTransactions.some(t => t.id === tx.id)) {
                this.blockchain.pendingTransactions.push(tx);
            }
        } catch (error) {
            logger.error('Failed to process transaction:', error);
        }
    }

    // ==================== PEER MANAGEMENT ====================

    async connectToPeer(url: string): Promise<void> {
        if (this.discovery.getKnownPeers().includes(url)) return;
        this.discovery.addKnownPeer(url);

        return new Promise((resolve, reject) => {
            const socket = new WebSocket(url);

            socket.on('open', () => {
                const hostname = new URL(url).hostname;
                const subnet = PeerManager.getSubnet(hostname);

                this.peerManager.addPeer(socket, {
                    url,
                    ip: hostname,
                    subnet,
                    verified: false,
                });

                socket.on('message', (data) => this.handleMessage(socket, data));
                socket.on('close', () => this.handleDisconnect(socket));
                socket.on('error', (err) => logger.error('Socket error:', err));

                this.send(socket, {
                    type: MessageType.HANDSHAKE,
                    data: this.handshake.createHandshakeData(this.blockchain.chain.length - 1),
                });

                logger.info(`🔗 Connected to peer: ${url}`);
                resolve();
            });

            socket.on('error', reject);
        });
    }

    private async connectToBootstrap(): Promise<void> {
        await this.discovery.connectToBootstrap();
    }

    private maintainPeers(): void {
        const stats = this.peerManager.getStats();
        logger.debug(`👥 Peer maintenance: ${stats.connected} connected, ${this.discovery.getKnownPeerCount()} known`);

        // Request more peers if below minimum
        if (stats.connected < MIN_PEERS) {
            logger.debug(`📡 Below minimum peers (${stats.connected}/${MIN_PEERS}), requesting more...`);
            this.broadcast({ type: MessageType.QUERY_PEERS, data: null });

            // Try bootstrap nodes
            this.connectToBootstrap();
        }

        // Continuous sync - request latest from random peer
        const verified = this.peerManager.getVerifiedPeers();
        if (verified.length > 0) {
            const randomPeer = verified[Math.floor(Math.random() * verified.length)];
            this.send(randomPeer.socket, { type: MessageType.QUERY_LATEST, data: null });
        }

        // Check and log grace period warnings
        const currentBlockHeight = this.blockchain.chain.length - 1;
        this.handshake.checkGraceWarning(currentBlockHeight);
    }

    // ==================== UTILITIES ====================

    private send(socket: WebSocket, message: P2PMessage): void {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(message));
        }
    }

    broadcast(message: P2PMessage): void {
        for (const peer of this.peerManager.getVerifiedPeers()) {
            this.send(peer.socket, message);
        }
    }

    // ==================== PUBLIC API ====================

    getPeerCount(): number {
        return this.peerManager.getPeerCount();
    }

    getPeers(): string[] {
        return this.peerManager.getVerifiedPeers().map(p => p.url);
    }

    getKnownPeers(): string[] {
        return this.discovery.getKnownPeers();
    }

    close(): void {
        if (this.server) {
            this.server.close();
            for (const peer of this.peerManager.getAllPeers().values()) {
                peer.socket.close();
            }
            this.peerManager.getAllPeers().clear();
            logger.info('P2P Server closed');
        }
    }
    // ==================== GENESIS SYNC ====================

    private handleQueryGenesis(socket: WebSocket): void {
        const genesisPath = path.join(config.storage.dataDir, 'genesis.json');
        try {
            if (fs.existsSync(genesisPath)) {
                const content = JSON.parse(fs.readFileSync(genesisPath, 'utf-8'));
                this.send(socket, { type: MessageType.RESPONSE_GENESIS, data: content });
                logger.info('📤 Sent genesis.json to peer');
            } else {
                logger.warn('⚠️ Peer requested genesis but local genesis.json missing');
            }
        } catch (err) {
            logger.error('Failed to read genesis.json:', err);
        }
    }

    private handleGenesisResponse(data: unknown): void {
        try {
            const genesisConfig = data as any;
            if (!genesisConfig || !genesisConfig.chainId) {
                logger.warn('⛔ Received invalid genesis data');
                return;
            }

            logger.info(`📥 Received genesis for chain: ${genesisConfig.chainId}`);
            logger.info('🔄 Restarting node to apply new genesis...');

            // Save to disk
            if (!fs.existsSync(config.storage.dataDir)) {
                fs.mkdirSync(config.storage.dataDir, { recursive: true });
            }

            const genesisPath = path.join(config.storage.dataDir, 'genesis.json');
            fs.writeFileSync(genesisPath, JSON.stringify(genesisConfig, null, 2));

            // Clear chain data
            const blocksPath = path.join(config.storage.dataDir, 'blocks.json');
            const poolPath = path.join(config.storage.dataDir, 'pool.json');

            if (fs.existsSync(blocksPath)) fs.unlinkSync(blocksPath);
            if (fs.existsSync(poolPath)) fs.unlinkSync(poolPath);

            logger.info('✅ Genesis synchronized! RESTARTING NODE...');

            // Exit to restart
            process.exit(0);

        } catch (err) {
            logger.error('Failed to save genesis:', err);
        }
    }
}

