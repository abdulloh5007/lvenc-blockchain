/**
 * Network Constants
 * Bootstrap nodes, timeouts, limits, and configuration values
 */

// ==================== BOOTSTRAP NODES ====================

export const BOOTSTRAP_NODES = [
    'wss://seed1.lvenc.site',
    // 'wss://seed2.lvenc.site',
    // 'wss://seed3.lvenc.site',
];

// ==================== PRIVATE IP RANGES ====================

export const PRIVATE_IP_RANGES = [
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^192\.168\./,
    /^127\./,
    /^localhost$/,
    /^::1$/,
];

// ==================== PEER LIMITS ====================

export const MIN_PEERS = 3;
export const MAX_PEERS_PER_IP = 3;
export const MAX_PEERS_PER_SUBNET = 5;

// ==================== TIMEOUTS (ms) ====================

export const RECONNECT_INTERVAL_MS = 60000;        // 60s - reconnect attempts
export const PEER_MAINTENANCE_INTERVAL_MS = 30000; // 30s - peer maintenance
export const PEX_RATE_LIMIT_MS = 10000;            // 10s - PEX request rate limit
export const BAN_DURATION_MS = 3600000;            // 1 hour - IP ban duration
export const DISCOVERY_TIMEOUT_MS = 1000;          // 1s - local node discovery timeout

// ==================== SCORING ====================

export const INITIAL_PEER_SCORE = 50;
export const MAX_PEERS_TO_SHARE = 10;

// ==================== PROTOCOL ====================

export const PROTOCOL_VERSION = '1.0';
