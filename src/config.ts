const isTestnet = process.env.NETWORK_MODE !== 'mainnet';

// Fixed genesis configuration for network consistency
// ALL nodes must use these values to have same genesis hash
const GENESIS_CONFIG = {
    // Fixed testnet faucet address (do not change!)
    testnetFaucetAddress: 'tEDU0000000000000000000000000000000000000001',
    mainnetFaucetAddress: 'EDU0000000000000000000000000000000000000001',
    // Fixed timestamp (January 1, 2026 00:00:00 UTC)
    timestamp: 1767225600000,
};

// Protocol Version Control
// Increment PROTOCOL_VERSION on breaking changes, update MIN_PROTOCOL_VERSION to enforce upgrades
const VERSION_CONFIG = {
    // Software version (semver)
    nodeVersion: '1.2.0',
    // Protocol version (increment on breaking network changes)
    protocolVersion: 1,
    // Minimum protocol version required to connect (used for mandatory updates)
    minProtocolVersion: 1,
    // Block-based grace period (null = no active grace period)
    // Set to current_block + GRACE_BLOCKS when releasing critical update
    graceUntilBlock: null as number | null,
    // Grace period in blocks (for reference: ~7 days at 30s blocks = ~20,160 blocks)
    gracePeriodBlocks: 20160,
};

// Chunk Sync Configuration
const SYNC_CONFIG = {
    // Number of blocks per chunk during sync
    chunkSize: 500,
    // Maximum blocks to request in one query
    maxBlocksPerRequest: 1000,
};

export const config = {
    network_mode: isTestnet ? 'testnet' : 'mainnet',
    isTestnet,
    blockchain: {
        difficulty: 5,
        validatorReward: 50,
        halvingInterval: 100,
        genesisAmount: 1000000,
        coinName: isTestnet ? 'tEDU' : 'EDU',
        coinSymbol: isTestnet ? 'tEDU' : 'EDU',
        addressPrefix: isTestnet ? 'tEDU' : 'EDU',
        maxTxPerBlock: 10,
        maxPendingTx: 100,
        minFee: 0.1,
    },
    network: {
        p2pPort: 6001,
        apiPort: 3001,
        initialPeers: [],
    },
    storage: {
        dataDir: isTestnet ? './data/testnet' : './data/mainnet',
        blocksFile: 'blocks.json',
        walletsDir: 'wallets',
    },
    api: {
        rateLimit: {
            windowMs: 60000,
            maxRequests: 100,
        },
        cors: {
            origin: '*',
        },
    },
    faucet: {
        enabled: isTestnet,
        amount: 100,
    },
    // Genesis block configuration (fixed for network consistency)
    genesis: {
        faucetAddress: isTestnet ? GENESIS_CONFIG.testnetFaucetAddress : GENESIS_CONFIG.mainnetFaucetAddress,
        timestamp: GENESIS_CONFIG.timestamp,
    },
    // Version control (for mandatory updates)
    version: VERSION_CONFIG,
    // Sync configuration
    sync: SYNC_CONFIG,
};
export type Config = typeof config;
