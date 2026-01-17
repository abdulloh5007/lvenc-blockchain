/**
 * Peer Discovery
 * Handles bootstrap connection, PEX (Peer Exchange), and local node discovery
 */

import WebSocket from 'ws';
import { PeerInfo, MessageType, P2PMessage } from '../types.js';
import {
    BOOTSTRAP_NODES,
    PEX_RATE_LIMIT_MS,
    MAX_PEERS_TO_SHARE,
    MIN_PEERS,
    DISCOVERY_TIMEOUT_MS,
    PRIVATE_IP_RANGES
} from '../constants.js';
import { PeerManager } from './PeerManager.js';
import { logger } from '../../utils/logger.js';

export class PeerDiscovery {
    private knownPeers: Set<string> = new Set();
    private peerManager: PeerManager;
    private connectCallback: (url: string) => Promise<void>;

    constructor(
        peerManager: PeerManager,
        connectCallback: (url: string) => Promise<void>
    ) {
        this.peerManager = peerManager;
        this.connectCallback = connectCallback;
    }

    // ==================== BOOTSTRAP ====================

    async connectToBootstrap(): Promise<void> {
        for (const seed of BOOTSTRAP_NODES) {
            try {
                await this.connectCallback(seed);
                logger.info(`🌱 Connected to bootstrap: ${seed}`);
            } catch {
                logger.warn(`⚠️ Failed to connect to bootstrap: ${seed}`);
            }
        }
    }

    // ==================== LOCAL DISCOVERY ====================

    async discoverLocalNodes(currentPort: number): Promise<void> {
        const ports = [6001, 6002, 6003, 6004, 6005];

        for (const port of ports) {
            if (port === currentPort) continue;

            const url = `ws://127.0.0.1:${port}`;
            try {
                await Promise.race([
                    this.connectCallback(url),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('timeout')), DISCOVERY_TIMEOUT_MS)
                    )
                ]);
            } catch {
                // Port not available
            }
        }
    }

    // ==================== PEX (Peer Exchange) ====================

    handlePeersQuery(socket: WebSocket, send: (msg: P2PMessage) => void): void {
        const peer = this.peerManager.getPeer(socket);
        if (!peer) return;

        // Rate limit PEX requests
        const now = Date.now();
        if (now - peer.lastPexRequest < PEX_RATE_LIMIT_MS) {
            this.peerManager.adjustScore(socket, -5);
            logger.warn(`⚠️ PEX rate limit exceeded by ${peer.ip}`);
            return;
        }
        peer.lastPexRequest = now;

        // Filter out localhost/internal peers - only share external URLs
        const externalPeers = Array.from(this.knownPeers).filter(url =>
            !url.includes('127.0.0.1') &&
            !url.includes('localhost') &&
            !url.includes('192.168.') &&
            !url.includes('10.0.')
        );

        const peersToShare = externalPeers.slice(0, MAX_PEERS_TO_SHARE);
        logger.debug(`📤 Sharing ${peersToShare.length} external peers via PEX`);

        send({
            type: MessageType.RESPONSE_PEERS,
            data: peersToShare,
        });
    }

    async handlePeersResponse(peers: string[]): Promise<void> {
        if (!peers || peers.length === 0) return;

        // Filter out localhost/internal URLs
        const externalPeers = peers.filter(url =>
            !url.includes('127.0.0.1') &&
            !url.includes('localhost') &&
            !url.includes('192.168.') &&
            !url.includes('10.0.')
        );

        logger.debug(`📥 Received ${peers.length} peers, ${externalPeers.length} external to process`);

        for (const peerUrl of externalPeers) {
            if (this.knownPeers.has(peerUrl)) continue;
            this.knownPeers.add(peerUrl);

            // Auto-connect if below minimum peers
            if (this.peerManager.getPeerCount() < MIN_PEERS) {
                try {
                    await this.connectCallback(peerUrl);
                    logger.info(`🔗 Auto-connected to discovered peer: ${peerUrl}`);
                } catch {
                    // Failed to connect
                }
            }
        }
    }

    // ==================== KNOWN PEERS ====================

    addKnownPeer(url: string): void {
        this.knownPeers.add(url);
    }

    removeKnownPeer(url: string): void {
        this.knownPeers.delete(url);
    }

    getKnownPeers(): string[] {
        return Array.from(this.knownPeers);
    }

    getKnownPeerCount(): number {
        return this.knownPeers.size;
    }
}
