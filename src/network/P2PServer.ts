import WebSocket, { WebSocketServer, RawData } from 'ws';
import { Blockchain, Block, Transaction } from '../blockchain/index.js';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';

// === CONSTANTS ===
const MAX_PEERS = 50;
const MAX_PEERS_PER_IP = 2;
const MAX_PEERS_PER_SUBNET = 5; // /24 subnet
const MAX_PEERS_TO_SHARE = 10; // Peers per PEX response
const PEX_RATE_LIMIT_MS = 30000; // 30 seconds between PEX requests
const PEER_TIMEOUT_MS = 30000;
const RECONNECT_INTERVAL_MS = 60000;
const BAN_DURATION_MS = 600000; // 10 minutes
const MIN_PEER_CONFIRMATIONS = 2; // Peer must be confirmed by N sources

// Bootstrap nodes (hardcoded trusted entry points)
// Primary VPS bootstrap nodes with SSL
const BOOTSTRAP_NODES = [
    'wss://seed1.lvenc.site',
    // Future nodes:
    // 'wss://seed2.lvenc.site',
    // 'wss://seed3.lvenc.site',
];

// Private IP ranges to ignore
const PRIVATE_IP_RANGES = [
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^192\.168\./,
    /^127\./,
    /^localhost$/,
    /^::1$/,
];

export enum MessageType {
    QUERY_LATEST = 'QUERY_LATEST',
    QUERY_ALL = 'QUERY_ALL',
    RESPONSE_BLOCKCHAIN = 'RESPONSE_BLOCKCHAIN',
    QUERY_TRANSACTION_POOL = 'QUERY_TRANSACTION_POOL',
    RESPONSE_TRANSACTION_POOL = 'RESPONSE_TRANSACTION_POOL',
    NEW_BLOCK = 'NEW_BLOCK',
    NEW_TRANSACTION = 'NEW_TRANSACTION',
    // Peer Exchange
    QUERY_PEERS = 'QUERY_PEERS',
    RESPONSE_PEERS = 'RESPONSE_PEERS',
    // Handshake
    HANDSHAKE = 'HANDSHAKE',
    HANDSHAKE_ACK = 'HANDSHAKE_ACK',
}

export interface P2PMessage {
    type: MessageType;
    data: unknown;
}

interface HandshakeData {
    protocolVersion: string;
    chainId: string;
    genesisHash: string;
    nodeVersion: string;
}

interface PeerInfo {
    socket: WebSocket;
    url: string;
    ip: string;
    subnet: string; // /24 subnet for diversity check
    verified: boolean;
    score: number;
    lastPexRequest: number;
    connectedAt: number;
}

export class P2PServer {
    private server: WebSocketServer | null = null;
    private peers: Map<WebSocket, PeerInfo> = new Map();
    private blockchain: Blockchain;
    private port: number;
    private knownPeers: Set<string> = new Set();
    private bannedIPs: Map<string, number> = new Map();
    private peerConfirmations: Map<string, Set<string>> = new Map(); // url -> set of sources
    private myUrl: string = '';
    private bootstrapMode: boolean = false; // Bootstrap node mode

    // Handshake info
    private readonly protocolVersion = '1.0.0';
    private readonly chainId: string;
    private readonly genesisHash: string;

    constructor(blockchain: Blockchain, port: number = 6001, bootstrapMode: boolean = false) {
        this.blockchain = blockchain;
        this.port = port;
        this.bootstrapMode = bootstrapMode;
        this.chainId = config.network_mode;
        this.genesisHash = blockchain.chain[0]?.hash || '0';
    }

    /**
     * Check if IP is private/local
     */
    private isPrivateIP(ip: string): boolean {
        for (const pattern of PRIVATE_IP_RANGES) {
            if (pattern.test(ip)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Start the P2P server
     */
    start(): void {
        this.server = new WebSocketServer({ port: this.port });
        this.myUrl = `ws://localhost:${this.port}`;

        this.server.on('connection', (socket: WebSocket, req) => {
            const ip = this.getClientIP(req);

            // Check if IP is banned
            if (this.isIPBanned(ip)) {
                logger.warn(`🚫 Rejected connection from banned IP: ${ip}`);
                socket.close();
                return;
            }

            // Check max peers per IP
            if (this.countPeersFromIP(ip) >= MAX_PEERS_PER_IP) {
                logger.warn(`🚫 Too many connections from IP: ${ip}`);
                socket.close();
                return;
            }

            // Check max total peers
            if (this.peers.size >= MAX_PEERS) {
                logger.warn(`🚫 Max peers reached, rejecting connection`);
                socket.close();
                return;
            }

            this.initConnection(socket, ip, `ws://${ip}:${this.port}`);
        });

        this.server.on('error', (error) => {
            logger.error('P2P Server error:', error);
        });

        if (this.bootstrapMode) {
            logger.info(`🌐 BOOTSTRAP NODE listening on port ${this.port}`);
            logger.info(`📡 Mode: Peer discovery only (no block production)`);
        } else {
            logger.info(`🌐 P2P Server listening on port ${this.port}`);
        }

        // Set up blockchain event handlers
        this.blockchain.onBlockMined = (block) => {
            this.broadcastBlock(block);
        };

        this.blockchain.onTransactionAdded = (tx) => {
            this.broadcastTransaction(tx);
        };

        // Periodic peer maintenance
        setInterval(() => this.maintainPeers(), RECONNECT_INTERVAL_MS);

        // Clean up banned IPs periodically
        setInterval(() => this.cleanupBans(), BAN_DURATION_MS);

        // Bootstrap nodes don't connect to other bootstrap nodes
        if (!this.bootstrapMode) {
            this.connectToBootstrap();
        }

        // Discover local nodes (only in development mode and not in bootstrap mode)
        if (process.env.NODE_ENV === 'development' && !this.bootstrapMode) {
            setTimeout(() => this.discoverLocalNodes(), 2000);
        }
    }

    /**
     * Discover other nodes on localhost (for local testing)
     */
    private async discoverLocalNodes(): Promise<void> {
        const localPorts = [6001, 6002, 6003, 6004, 6005, 6006, 6007, 6008, 6009, 6010];

        for (const p of localPorts) {
            // Skip our own port
            if (p === this.port) continue;

            const localUrl = `ws://localhost:${p}`;

            // Skip if already known
            if (this.knownPeers.has(localUrl)) continue;

            try {
                await this.connectToPeer(localUrl);
                logger.info(`🔍 Auto-discovered local node on port ${p}`);
            } catch {
                // Port not available, skip
            }
        }
    }

    /**
     * Get client IP from request
     */
    private getClientIP(req: any): string {
        const forwarded = req.headers['x-forwarded-for'];
        if (forwarded) {
            return forwarded.split(',')[0].trim();
        }
        return req.socket.remoteAddress?.replace('::ffff:', '') || 'unknown';
    }

    /**
     * Check if IP is banned
     */
    private isIPBanned(ip: string): boolean {
        const banExpiry = this.bannedIPs.get(ip);
        if (!banExpiry) return false;
        if (Date.now() > banExpiry) {
            this.bannedIPs.delete(ip);
            return false;
        }
        return true;
    }

    /**
     * Ban an IP
     */
    private banIP(ip: string, reason: string): void {
        this.bannedIPs.set(ip, Date.now() + BAN_DURATION_MS);
        logger.warn(`🔨 Banned IP ${ip} for: ${reason}`);
    }

    /**
     * Count peers from specific IP
     */
    private countPeersFromIP(ip: string): number {
        let count = 0;
        for (const peer of this.peers.values()) {
            if (peer.ip === ip) count++;
        }
        return count;
    }

    /**
     * Extract /24 subnet from IP address
     */
    private getSubnet(ip: string): string {
        // Handle localhost specially
        if (ip === 'localhost' || ip === '127.0.0.1' || ip === '::1') {
            return 'localhost';
        }
        // Extract /24 subnet (first 3 octets)
        const parts = ip.split('.');
        if (parts.length === 4) {
            return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
        }
        return ip; // Return as-is for IPv6 or unknown format
    }

    /**
     * Count peers from specific /24 subnet
     */
    private countPeersFromSubnet(subnet: string): number {
        let count = 0;
        for (const peer of this.peers.values()) {
            if (peer.subnet === subnet) count++;
        }
        return count;
    }

    /**
     * Connect to bootstrap nodes
     */
    private async connectToBootstrap(): Promise<void> {
        for (const node of BOOTSTRAP_NODES) {
            if (this.knownPeers.has(node)) continue;
            try {
                await this.connectToPeer(node);
            } catch {
                // Bootstrap node unavailable, continue
            }
        }
    }

    /**
     * Periodic peer maintenance
     */
    private maintainPeers(): void {
        // Rotate peers - disconnect from lowest scoring peers if we have many
        if (this.peers.size > MAX_PEERS * 0.8) {
            const sorted = Array.from(this.peers.entries())
                .sort((a, b) => a[1].score - b[1].score);

            // Disconnect bottom 10%
            const toRemove = Math.floor(this.peers.size * 0.1);
            for (let i = 0; i < toRemove; i++) {
                const [socket] = sorted[i];
                socket.close();
            }
        }

        // Try to connect to more peers if we have few
        if (this.peers.size < 5) {
            this.connectToBootstrap();
        }
    }

    /**
     * Clean up expired bans
     */
    private cleanupBans(): void {
        const now = Date.now();
        for (const [ip, expiry] of this.bannedIPs.entries()) {
            if (now > expiry) {
                this.bannedIPs.delete(ip);
            }
        }
    }

    /**
     * Initialize a new connection
     */
    private initConnection(socket: WebSocket, ip: string, url: string): void {
        const subnet = this.getSubnet(ip);

        // Check subnet diversity
        if (this.countPeersFromSubnet(subnet) >= MAX_PEERS_PER_SUBNET) {
            logger.warn(`🚫 Too many peers from subnet ${subnet}`);
            socket.close();
            return;
        }

        const peerInfo: PeerInfo = {
            socket,
            url,
            ip,
            subnet,
            verified: false,
            score: 50, // Start with neutral score
            lastPexRequest: 0,
            connectedAt: Date.now(),
        };

        this.peers.set(socket, peerInfo);
        logger.info(`🔗 New peer connected from ${ip}. Total peers: ${this.peers.size}`);

        socket.on('message', (data: RawData) => {
            this.handleMessage(socket, data);
        });

        socket.on('close', () => {
            this.peers.delete(socket);
            logger.info(`❌ Peer disconnected. Total peers: ${this.peers.size}`);
        });

        socket.on('error', (error) => {
            logger.error('Socket error:', error);
            const peer = this.peers.get(socket);
            if (peer) {
                peer.score -= 10;
            }
        });

        // Send handshake
        this.send(socket, {
            type: MessageType.HANDSHAKE,
            data: {
                protocolVersion: this.protocolVersion,
                chainId: this.chainId,
                genesisHash: this.genesisHash,
                nodeVersion: '1.0.0',
            } as HandshakeData,
        });
    }

    /**
     * Handle incoming message
     */
    private handleMessage(socket: WebSocket, rawData: RawData): void {
        const peer = this.peers.get(socket);
        if (!peer) return;

        try {
            const message: P2PMessage = JSON.parse(rawData.toString());

            // Only allow handshake before verification
            if (!peer.verified && message.type !== MessageType.HANDSHAKE && message.type !== MessageType.HANDSHAKE_ACK) {
                logger.warn(`🚫 Unverified peer sent ${message.type}`);
                return;
            }

            switch (message.type) {
                case MessageType.HANDSHAKE:
                    this.handleHandshake(socket, message.data as HandshakeData);
                    break;

                case MessageType.HANDSHAKE_ACK:
                    peer.verified = true;
                    peer.score += 10;
                    // Now request blockchain data
                    this.send(socket, { type: MessageType.QUERY_LATEST, data: null });
                    break;

                case MessageType.QUERY_LATEST:
                    this.send(socket, {
                        type: MessageType.RESPONSE_BLOCKCHAIN,
                        data: [this.blockchain.getLatestBlock().toJSON()],
                    });
                    peer.score += 1;
                    break;

                case MessageType.QUERY_ALL:
                    this.send(socket, {
                        type: MessageType.RESPONSE_BLOCKCHAIN,
                        data: this.blockchain.chain.map(b => b.toJSON()),
                    });
                    peer.score += 2;
                    break;

                case MessageType.RESPONSE_BLOCKCHAIN:
                    this.handleBlockchainResponse(message.data as unknown[]);
                    peer.score += 5;
                    break;

                case MessageType.QUERY_TRANSACTION_POOL:
                    this.send(socket, {
                        type: MessageType.RESPONSE_TRANSACTION_POOL,
                        data: this.blockchain.pendingTransactions.map(tx => tx.toJSON()),
                    });
                    break;

                case MessageType.RESPONSE_TRANSACTION_POOL:
                    this.handleTransactionPoolResponse(message.data as unknown[]);
                    break;

                case MessageType.NEW_BLOCK:
                    this.handleNewBlock(message.data);
                    peer.score += 3;
                    break;

                case MessageType.NEW_TRANSACTION:
                    this.handleNewTransaction(message.data);
                    peer.score += 1;
                    break;

                case MessageType.QUERY_PEERS:
                    this.handlePeersQuery(socket);
                    break;

                case MessageType.RESPONSE_PEERS:
                    this.handlePeersResponse(message.data as string[]);
                    break;
            }
        } catch (error) {
            logger.error('Failed to parse message:', error);
            peer.score -= 5;
            if (peer.score < 0) {
                this.banIP(peer.ip, 'Too many errors');
                socket.close();
            }
        }
    }

    /**
     * Handle handshake
     */
    private handleHandshake(socket: WebSocket, data: HandshakeData): void {
        const peer = this.peers.get(socket);
        if (!peer) return;

        // Verify protocol version
        if (data.protocolVersion !== this.protocolVersion) {
            logger.warn(`🚫 Incompatible protocol: ${data.protocolVersion}`);
            socket.close();
            return;
        }

        // Verify chain ID
        if (data.chainId !== this.chainId) {
            logger.warn(`🚫 Wrong chain: ${data.chainId} (expected ${this.chainId})`);
            socket.close();
            return;
        }

        // Verify genesis hash
        if (data.genesisHash !== this.genesisHash) {
            logger.warn(`🚫 Wrong genesis: ${data.genesisHash}`);
            socket.close();
            return;
        }

        peer.verified = true;
        peer.score += 10;

        // Send acknowledgment
        this.send(socket, { type: MessageType.HANDSHAKE_ACK, data: null });

        // Request blockchain data
        this.send(socket, { type: MessageType.QUERY_LATEST, data: null });
        this.send(socket, { type: MessageType.QUERY_PEERS, data: null });
    }

    /**
     * Handle peers query with rate limiting
     */
    private handlePeersQuery(socket: WebSocket): void {
        const peer = this.peers.get(socket);
        if (!peer) return;

        // Rate limit PEX requests
        const now = Date.now();
        if (now - peer.lastPexRequest < PEX_RATE_LIMIT_MS) {
            peer.score -= 5;
            logger.warn(`⚠️ PEX rate limit exceeded by ${peer.ip}`);
            return;
        }
        peer.lastPexRequest = now;

        // Send random subset of peers
        const allPeers = Array.from(this.knownPeers);
        const shuffled = allPeers.sort(() => Math.random() - 0.5);
        const subset = shuffled.slice(0, MAX_PEERS_TO_SHARE);

        this.send(socket, {
            type: MessageType.RESPONSE_PEERS,
            data: subset,
        });
    }

    /**
     * Handle peers response - auto-connect to new peers
     */
    private async handlePeersResponse(peers: string[]): Promise<void> {
        // Only accept limited number
        const toProcess = peers.slice(0, MAX_PEERS_TO_SHARE);

        for (const peerUrl of toProcess) {
            if (this.knownPeers.has(peerUrl) || peerUrl === this.myUrl) {
                continue;
            }

            if (this.peers.size >= MAX_PEERS) {
                break;
            }

            try {
                await this.connectToPeer(peerUrl);
                logger.info(`🔗 Auto-connected to discovered peer: ${peerUrl}`);
            } catch {
                // Failed to connect
            }
        }
    }

    /**
     * Handle blockchain response
     */
    private handleBlockchainResponse(data: unknown[]): void {
        if (!data || data.length === 0) return;

        const receivedBlocks = data.map(b => Block.fromJSON(b as any));
        const latestReceived = receivedBlocks[receivedBlocks.length - 1];
        const latestLocal = this.blockchain.getLatestBlock();

        if (latestReceived.index > latestLocal.index) {
            logger.info(`📦 Received blockchain is ahead. Local: ${latestLocal.index}, Received: ${latestReceived.index}`);

            if (latestLocal.hash === latestReceived.previousHash) {
                this.blockchain.chain.push(latestReceived);
                logger.info(`✅ Added new block ${latestReceived.index}`);
            } else if (receivedBlocks.length === 1) {
                this.broadcast({ type: MessageType.QUERY_ALL, data: null });
            } else {
                this.blockchain.replaceChain(receivedBlocks);
            }
        }
    }

    /**
     * Handle transaction pool response
     */
    private handleTransactionPoolResponse(data: unknown[]): void {
        if (!data || data.length === 0) return;

        for (const txData of data) {
            const tx = Transaction.fromJSON(txData as any);
            try {
                this.blockchain.addTransaction(tx);
            } catch {
                // Transaction might already exist or be invalid
            }
        }
    }

    /**
     * Handle new block announcement
     */
    private handleNewBlock(data: unknown): void {
        const block = Block.fromJSON(data as any);
        const latestLocal = this.blockchain.getLatestBlock();

        if (block.previousHash === latestLocal.hash && block.index === latestLocal.index + 1) {
            this.blockchain.chain.push(block);
            logger.info(`🆕 Received and added block ${block.index}`);

            for (const tx of block.transactions) {
                this.blockchain.pendingTransactions = this.blockchain.pendingTransactions
                    .filter(pt => pt.id !== tx.id);
            }
        } else if (block.index > latestLocal.index) {
            this.broadcast({ type: MessageType.QUERY_ALL, data: null });
        }
    }

    /**
     * Handle new transaction announcement
     */
    private handleNewTransaction(data: unknown): void {
        const tx = Transaction.fromJSON(data as any);
        try {
            this.blockchain.addTransaction(tx);
            logger.info(`📝 Received transaction: ${tx.id.substring(0, 8)}...`);
        } catch (error) {
            // Transaction might already exist or be invalid
        }
    }

    /**
     * Connect to a peer
     */
    connectToPeer(peerUrl: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if (peerUrl === this.myUrl) {
                reject(new Error('Cannot connect to self'));
                return;
            }

            // Check if already connected
            for (const peer of this.peers.values()) {
                if (peer.url === peerUrl) {
                    resolve();
                    return;
                }
            }

            // Check max peers
            if (this.peers.size >= MAX_PEERS) {
                reject(new Error('Max peers reached'));
                return;
            }

            const socket = new WebSocket(peerUrl);

            // Extract IP from URL
            const urlObj = new URL(peerUrl);
            const ip = urlObj.hostname;

            socket.on('open', () => {
                this.initConnection(socket, ip, peerUrl);
                this.knownPeers.add(peerUrl);
                logger.info(`🔗 Connected to peer: ${peerUrl}`);
                resolve();
            });

            socket.on('error', (error) => {
                reject(error);
            });

            // Timeout
            setTimeout(() => {
                if (socket.readyState === WebSocket.CONNECTING) {
                    socket.close();
                    reject(new Error('Connection timeout'));
                }
            }, PEER_TIMEOUT_MS);
        });
    }

    /**
     * Send message to a socket
     */
    private send(socket: WebSocket, message: P2PMessage): void {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(message));
        }
    }

    /**
     * Broadcast message to all verified peers
     */
    private broadcast(message: P2PMessage): void {
        for (const [socket, peer] of this.peers.entries()) {
            if (socket.readyState === WebSocket.OPEN && peer.verified) {
                this.send(socket, message);
            }
        }
    }

    /**
     * Broadcast a new block
     */
    broadcastBlock(block: Block): void {
        logger.info(`📢 Broadcasting block ${block.index}`);
        this.broadcast({ type: MessageType.NEW_BLOCK, data: block.toJSON() });
    }

    /**
     * Broadcast a new transaction
     */
    broadcastTransaction(tx: Transaction): void {
        logger.info(`📢 Broadcasting transaction ${tx.id.substring(0, 8)}...`);
        this.broadcast({ type: MessageType.NEW_TRANSACTION, data: tx.toJSON() });
    }

    /**
     * Get list of connected peers
     */
    getPeers(): string[] {
        return Array.from(this.peers.values())
            .filter(p => p.verified)
            .map(p => p.url);
    }

    /**
     * Get number of connected peers
     */
    getPeerCount(): number {
        return Array.from(this.peers.values()).filter(p => p.verified).length;
    }

    /**
     * Get known peers
     */
    getKnownPeers(): string[] {
        return Array.from(this.knownPeers);
    }

    /**
     * Close the server
     */
    close(): void {
        if (this.server) {
            this.server.close();
            for (const peer of this.peers.values()) {
                peer.socket.close();
            }
            this.peers.clear();
            logger.info('P2P Server closed');
        }
    }
}
