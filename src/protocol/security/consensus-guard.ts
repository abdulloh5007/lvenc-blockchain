import { logger } from '../utils/logger.js';
import * as crypto from 'crypto';

interface Checkpoint {
    height: number;
    hash: string;
    timestamp: number;
}

interface PeerReputation {
    score: number;
    lastSeen: number;
    violations: number;
}

const checkpoints: Checkpoint[] = [];
const peerReputation = new Map<string, PeerReputation>();
const peerConnections = new Map<string, Set<string>>();
const rejectedBlocks = new Map<string, number>();

const CHECKPOINT_INTERVAL = 100;
const MIN_PEER_SCORE = 0;
const MAX_PEER_SCORE = 100;
const INITIAL_PEER_SCORE = 50;
const VIOLATION_PENALTY = 10;
const GOOD_BEHAVIOR_REWARD = 1;
const MIN_DIVERSE_PEERS = 3;
const MAX_BLOCK_TIME_DRIFT = 120000;
const REJECTION_THRESHOLD = 3;

export function addCheckpoint(height: number, hash: string): void {
    if (height % CHECKPOINT_INTERVAL === 0) {
        checkpoints.push({ height, hash, timestamp: Date.now() });
        logger.info(`📍 Checkpoint added: ${height} (${hash.slice(0, 8)}...)`);
    }
}

export function getLatestCheckpoint(): Checkpoint | null {
    return checkpoints[checkpoints.length - 1] || null;
}

export function validateAgainstCheckpoint(height: number, hash: string): boolean {
    const cp = checkpoints.find(c => c.height === height);
    if (cp && cp.hash !== hash) {
        logger.warn(`🚨 51% attack detected: block ${height} hash mismatch`);
        return false;
    }
    return true;
}

export function isReorgAllowed(currentHeight: number, newChainHeight: number): boolean {
    const latestCp = getLatestCheckpoint();
    if (latestCp && newChainHeight <= latestCp.height) {
        logger.warn(`🚨 Reorg blocked: cannot reorg past checkpoint ${latestCp.height}`);
        return false;
    }
    return true;
}

export function initPeer(peerId: string): void {
    if (!peerReputation.has(peerId)) {
        peerReputation.set(peerId, { score: INITIAL_PEER_SCORE, lastSeen: Date.now(), violations: 0 });
    }
}

export function updatePeerScore(peerId: string, delta: number): void {
    const peer = peerReputation.get(peerId);
    if (peer) {
        peer.score = Math.max(MIN_PEER_SCORE, Math.min(MAX_PEER_SCORE, peer.score + delta));
        peer.lastSeen = Date.now();
        if (delta < 0) peer.violations++;
    }
}

export function reportViolation(peerId: string): void {
    updatePeerScore(peerId, -VIOLATION_PENALTY);
    logger.warn(`🚨 Peer violation: ${peerId}`);
}

export function rewardPeer(peerId: string): void {
    updatePeerScore(peerId, GOOD_BEHAVIOR_REWARD);
}

export function getPeerScore(peerId: string): number {
    return peerReputation.get(peerId)?.score ?? 0;
}

export function isTrustedPeer(peerId: string, minScore: number = 30): boolean {
    return getPeerScore(peerId) >= minScore;
}

export function banPeer(peerId: string): void {
    peerReputation.delete(peerId);
    peerConnections.delete(peerId);
    logger.warn(`🚫 Peer banned: ${peerId}`);
}

export function detectSybil(peerIds: string[], ipAddresses: string[]): string[] {
    const ipCount = new Map<string, string[]>();
    peerIds.forEach((id, i) => {
        const ip = ipAddresses[i]?.split(':')[0];
        if (ip) ipCount.set(ip, [...(ipCount.get(ip) || []), id]);
    });
    const sybils: string[] = [];
    for (const [ip, ids] of ipCount) {
        if (ids.length > 3) {
            logger.warn(`🚨 Sybil detected: ${ids.length} peers from ${ip}`);
            sybils.push(...ids.slice(3));
        }
    }
    return sybils;
}

export function ensureDiversePeers(connections: Map<string, string[]>): boolean {
    const subnets = new Set<string>();
    for (const [, ips] of connections) {
        ips.forEach(ip => subnets.add(ip.split('.').slice(0, 2).join('.')));
    }
    if (subnets.size < MIN_DIVERSE_PEERS) {
        logger.warn(`🚨 Eclipse risk: only ${subnets.size} unique subnets`);
        return false;
    }
    return true;
}

export function validateBlockTimestamp(blockTime: number, prevBlockTime: number): boolean {
    const now = Date.now();
    if (blockTime > now + MAX_BLOCK_TIME_DRIFT) {
        logger.warn(`🚨 Future block rejected: ${new Date(blockTime)}`);
        return false;
    }
    if (blockTime < prevBlockTime) {
        logger.warn(`🚨 Block time before previous block`);
        return false;
    }
    return true;
}

export function reportRejectedBlock(hash: string): boolean {
    const count = (rejectedBlocks.get(hash) || 0) + 1;
    rejectedBlocks.set(hash, count);
    if (count >= REJECTION_THRESHOLD) {
        logger.warn(`🚨 Block rejected by ${count} peers: ${hash.slice(0, 8)}...`);
        return true;
    }
    return false;
}

export function generatePeerId(): string {
    return crypto.randomBytes(16).toString('hex');
}

setInterval(() => {
    const now = Date.now();
    const staleTimeout = 10 * 60 * 1000;
    for (const [id, peer] of peerReputation) {
        if (now - peer.lastSeen > staleTimeout) peerReputation.delete(id);
    }
    rejectedBlocks.clear();
}, 5 * 60 * 1000);
