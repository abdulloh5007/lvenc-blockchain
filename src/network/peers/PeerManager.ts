/**
 * Peer Manager
 * Handles peer tracking, scoring, banning, and subnet management
 */

import WebSocket from 'ws';
import { PeerInfo, PeerStats } from '../types.js';
import {
    BAN_DURATION_MS,
    MAX_PEERS_PER_IP,
    MAX_PEERS_PER_SUBNET,
    INITIAL_PEER_SCORE,
    PRIVATE_IP_RANGES
} from '../constants.js';
import { logger } from '../../protocol/utils/logger.js';

export class PeerManager {
    private peers: Map<WebSocket, PeerInfo> = new Map();
    private bannedIPs: Map<string, number> = new Map();

    // ==================== PEER MANAGEMENT ====================

    addPeer(socket: WebSocket, info: Omit<PeerInfo, 'socket' | 'score' | 'lastPexRequest' | 'connectedAt'>): PeerInfo {
        const peerInfo: PeerInfo = {
            ...info,
            socket,
            score: INITIAL_PEER_SCORE,
            lastPexRequest: 0,
            connectedAt: Date.now(),
        };
        this.peers.set(socket, peerInfo);
        return peerInfo;
    }

    removePeer(socket: WebSocket): void {
        this.peers.delete(socket);
    }

    getPeer(socket: WebSocket): PeerInfo | undefined {
        return this.peers.get(socket);
    }

    getAllPeers(): Map<WebSocket, PeerInfo> {
        return this.peers;
    }

    getVerifiedPeers(): PeerInfo[] {
        return Array.from(this.peers.values()).filter(p => p.verified);
    }

    getPeerCount(): number {
        return this.peers.size;
    }

    getStats(): PeerStats {
        return {
            connected: this.peers.size,
            verified: this.getVerifiedPeers().length,
            known: this.peers.size,
            banned: this.bannedIPs.size,
        };
    }

    // ==================== SCORING ====================

    adjustScore(socket: WebSocket, delta: number): void {
        const peer = this.peers.get(socket);
        if (peer) {
            peer.score += delta;
        }
    }

    // ==================== BANNING ====================

    banIP(ip: string, reason: string): void {
        this.bannedIPs.set(ip, Date.now() + BAN_DURATION_MS);
        logger.warn(`🚫 Banned IP ${ip}: ${reason}`);
    }

    isIPBanned(ip: string): boolean {
        const banExpiry = this.bannedIPs.get(ip);
        if (!banExpiry) return false;

        if (Date.now() > banExpiry) {
            this.bannedIPs.delete(ip);
            return false;
        }
        return true;
    }

    cleanupExpiredBans(): void {
        const now = Date.now();
        for (const [ip, expiry] of this.bannedIPs.entries()) {
            if (now > expiry) {
                this.bannedIPs.delete(ip);
                logger.debug(`🔓 Ban expired for ${ip}`);
            }
        }
    }

    // ==================== IP/SUBNET LIMITS ====================

    countPeersFromIP(ip: string): number {
        let count = 0;
        for (const peer of this.peers.values()) {
            if (peer.ip === ip) count++;
        }
        return count;
    }

    countPeersFromSubnet(subnet: string): number {
        let count = 0;
        for (const peer of this.peers.values()) {
            if (peer.subnet === subnet) count++;
        }
        return count;
    }

    canAcceptFromIP(ip: string): boolean {
        return this.countPeersFromIP(ip) < MAX_PEERS_PER_IP;
    }

    canAcceptFromSubnet(subnet: string): boolean {
        return this.countPeersFromSubnet(subnet) < MAX_PEERS_PER_SUBNET;
    }

    // ==================== IP UTILITIES ====================

    static getSubnet(ip: string): string {
        const parts = ip.split('.');
        if (parts.length === 4) {
            return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
        }
        // For IPv6 or other formats, use the full IP as subnet
        return ip;
    }

    static isPrivateIP(ip: string): boolean {
        return PRIVATE_IP_RANGES.some(range => range.test(ip));
    }

    static getClientIP(req: any): string {
        const forwarded = req.headers?.['x-forwarded-for'];
        if (forwarded) {
            return forwarded.toString().split(',')[0].trim();
        }
        return req.socket?.remoteAddress || '0.0.0.0';
    }
}
