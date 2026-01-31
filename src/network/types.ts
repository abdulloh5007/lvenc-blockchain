/**
 * Network Protocol Types
 * Message types, interfaces, and data structures for P2P communication
 */

import WebSocket from 'ws';

// ==================== MESSAGE TYPES ====================

export enum MessageType {
    // Blockchain sync
    QUERY_LATEST = 'QUERY_LATEST',
    QUERY_ALL = 'QUERY_ALL',
    RESPONSE_BLOCKCHAIN = 'RESPONSE_BLOCKCHAIN',

    // Transaction pool
    QUERY_TRANSACTION_POOL = 'QUERY_TRANSACTION_POOL',
    RESPONSE_TRANSACTION_POOL = 'RESPONSE_TRANSACTION_POOL',

    // Gossip
    NEW_BLOCK = 'NEW_BLOCK',
    NEW_TRANSACTION = 'NEW_TRANSACTION',

    // Peer Exchange (PEX)
    QUERY_PEERS = 'QUERY_PEERS',
    RESPONSE_PEERS = 'RESPONSE_PEERS',

    // Handshake
    HANDSHAKE = 'HANDSHAKE',
    HANDSHAKE_ACK = 'HANDSHAKE_ACK',

    // Chunk Sync (for large blockchains)
    QUERY_BLOCKS_FROM = 'QUERY_BLOCKS_FROM',
    RESPONSE_BLOCKS = 'RESPONSE_BLOCKS',

    // Genesis Sync
    QUERY_GENESIS = 'QUERY_GENESIS',
    RESPONSE_GENESIS = 'RESPONSE_GENESIS',

    // Version Control
    VERSION_REJECT = 'VERSION_REJECT',
    VERSION_ANNOUNCEMENT = 'VERSION_ANNOUNCEMENT',  // Network-wide version broadcast
}

// ==================== VERSION ERROR CODES ====================

export enum VersionErrorCode {
    ERR_MIN_PROTOCOL = 'ERR_MIN_PROTOCOL',           // Protocol version below minimum
    ERR_GRACE_EXPIRED = 'ERR_GRACE_EXPIRED',         // Grace period expired
    ERR_MALFORMED_PROTOCOL = 'ERR_MALFORMED_PROTOCOL', // Invalid protocol messages
    ERR_GENESIS_MISMATCH = 'ERR_GENESIS_MISMATCH',   // Genesis hash mismatch (critical)
}

// ==================== NODE STATUS FLAGS ====================

export enum NodeVersionStatus {
    UP_TO_DATE = 'UP_TO_DATE',
    OUTDATED_WITHIN_GRACE = 'OUTDATED_WITHIN_GRACE',
    OUTDATED_GRACE_EXPIRED = 'OUTDATED_GRACE_EXPIRED',
}

// ==================== MESSAGE INTERFACES ====================

export interface P2PMessage {
    type: MessageType;
    data: unknown;
}

export interface HandshakeData {
    nodeId: string;              // Ed25519 public key (hex) - cryptographic identity
    protocolVersion: number;
    minProtocolVersion: number;
    graceUntilBlock: number | null;  // Block-based grace (not timestamp)
    chainId: string;
    genesisHash: string;
    nodeVersion: string;
    blockHeight: number;
    rewardAddress: string | null;   // Wallet address for rewards
}

export interface VersionRejectData {
    errorCode: VersionErrorCode;
    currentVersion: number;
    requiredVersion: number;
    graceUntilBlock: number | null;
    recommendedAction: string;
}

export interface VersionAnnouncementData {
    minProtocolVersion: number;
    graceUntilBlock: number | null;
}

// ==================== SYNC INTERFACES ====================

export interface ChunkSyncRequest {
    startIndex: number;
    limit: number;
}

export interface ChunkSyncResponse {
    blocks: unknown[];
    hasMore: boolean;
    totalBlocks: number;
}

// ==================== PEER INTERFACES ====================

export interface PeerInfo {
    socket: WebSocket;
    url: string;
    ip: string;
    subnet: string;
    verified: boolean;
    score: number;
    lastPexRequest: number;
    connectedAt: number;
}

export interface PeerStats {
    connected: number;
    verified: number;
    known: number;
    banned: number;
}
