import WebSocket, { WebSocketServer, RawData } from 'ws';
import { Blockchain, Block, Transaction } from '../blockchain/index.js';
import { logger } from '../utils/logger.js';

export enum MessageType {
    QUERY_LATEST = 'QUERY_LATEST',
    QUERY_ALL = 'QUERY_ALL',
    RESPONSE_BLOCKCHAIN = 'RESPONSE_BLOCKCHAIN',
    QUERY_TRANSACTION_POOL = 'QUERY_TRANSACTION_POOL',
    RESPONSE_TRANSACTION_POOL = 'RESPONSE_TRANSACTION_POOL',
    NEW_BLOCK = 'NEW_BLOCK',
    NEW_TRANSACTION = 'NEW_TRANSACTION',
}

export interface P2PMessage {
    type: MessageType;
    data: unknown;
}

export class P2PServer {
    private server: WebSocketServer | null = null;
    private sockets: WebSocket[] = [];
    private blockchain: Blockchain;
    private port: number;

    constructor(blockchain: Blockchain, port: number = 6001) {
        this.blockchain = blockchain;
        this.port = port;
    }

    /**
     * Start the P2P server
     */
    start(): void {
        this.server = new WebSocketServer({ port: this.port });

        this.server.on('connection', (socket) => {
            this.initConnection(socket);
        });

        this.server.on('error', (error) => {
            logger.error('P2P Server error:', error);
        });

        logger.info(`🌐 P2P Server listening on port ${this.port}`);

        // Set up blockchain event handlers
        this.blockchain.onBlockMined = (block) => {
            this.broadcastBlock(block);
        };

        this.blockchain.onTransactionAdded = (tx) => {
            this.broadcastTransaction(tx);
        };
    }

    /**
     * Initialize a new connection
     */
    private initConnection(socket: WebSocket): void {
        this.sockets.push(socket);
        logger.info(`🔗 New peer connected. Total peers: ${this.sockets.length}`);

        socket.on('message', (data: RawData) => {
            this.handleMessage(socket, data);
        });

        socket.on('close', () => {
            this.sockets = this.sockets.filter(s => s !== socket);
            logger.info(`❌ Peer disconnected. Total peers: ${this.sockets.length}`);
        });

        socket.on('error', (error) => {
            logger.error('Socket error:', error);
        });

        // Request latest block from new peer
        this.send(socket, { type: MessageType.QUERY_LATEST, data: null });
    }

    /**
     * Handle incoming message
     */
    private handleMessage(socket: WebSocket, rawData: RawData): void {
        try {
            const message: P2PMessage = JSON.parse(rawData.toString());

            switch (message.type) {
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
                    this.handleBlockchainResponse(message.data as unknown[]);
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
                    break;

                case MessageType.NEW_TRANSACTION:
                    this.handleNewTransaction(message.data);
                    break;
            }
        } catch (error) {
            logger.error('Failed to parse message:', error);
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
                // We can just add the new block
                this.blockchain.chain.push(latestReceived);
                logger.info(`✅ Added new block ${latestReceived.index}`);
            } else if (receivedBlocks.length === 1) {
                // Need to query the whole chain
                this.broadcast({ type: MessageType.QUERY_ALL, data: null });
            } else {
                // Replace our chain
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

            // Remove mined transactions from pending pool
            for (const tx of block.transactions) {
                this.blockchain.pendingTransactions = this.blockchain.pendingTransactions
                    .filter(pt => pt.id !== tx.id);
            }
        } else if (block.index > latestLocal.index) {
            // We're behind, request full chain
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
            const socket = new WebSocket(peerUrl);

            socket.on('open', () => {
                this.initConnection(socket);
                logger.info(`🔗 Connected to peer: ${peerUrl}`);
                resolve();
            });

            socket.on('error', (error) => {
                logger.error(`Failed to connect to ${peerUrl}:`, error);
                reject(error);
            });
        });
    }

    /**
     * Send message to a socket
     */
    private send(socket: WebSocket, message: P2PMessage): void {
        socket.send(JSON.stringify(message));
    }

    /**
     * Broadcast message to all peers
     */
    private broadcast(message: P2PMessage): void {
        for (const socket of this.sockets) {
            if (socket.readyState === WebSocket.OPEN) {
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
        return this.sockets
            .filter(s => s.readyState === WebSocket.OPEN)
            .map((s, i) => `Peer ${i + 1}`);
    }

    /**
     * Get number of connected peers
     */
    getPeerCount(): number {
        return this.sockets.filter(s => s.readyState === WebSocket.OPEN).length;
    }

    /**
     * Close the server
     */
    close(): void {
        if (this.server) {
            this.server.close();
            for (const socket of this.sockets) {
                socket.close();
            }
            this.sockets = [];
            logger.info('P2P Server closed');
        }
    }
}
