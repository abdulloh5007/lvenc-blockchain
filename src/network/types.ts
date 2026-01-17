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

    // Version Control
    VERSION_REJECT = 'VERSION_REJECT',
}

// ==================== MESSAGE INTERFACES ====================

export interface P2PMessage {
    type: MessageType;
    data: unknown;
}

export interface HandshakeData {
    protocolVersion: number;
    minProtocolVersion: number;
    graceDeadline: number | null;
    chainId: string;
    genesisHash: string;
    nodeVersion: string;
    blockHeight: number;
}

export interface VersionRejectData {
    reason: string;
    minVersion: number;
    yourVersion: number;
    updateCommand: string;
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
