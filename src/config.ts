export const config = {
    // Blockchain settings
    blockchain: {
        difficulty: 5,              // Number of leading zeros required in hash (5 = ~10-30 sec)
        miningReward: 50,           // Initial reward for mining a block
        halvingInterval: 100,       // Halve reward every N blocks (Bitcoin: 210000)
        genesisAmount: 1000000,     // Initial coins in genesis block
        coinName: 'EDU',            // Name of the coin
        coinSymbol: 'EDU',
        maxTxPerBlock: 10,          // Maximum transactions per block (Bitcoin: ~2000)
        maxPendingTx: 100,          // Maximum pending transactions
        minFee: 0.1,                // Minimum transaction fee
    },

    // Network settings
    network: {
        p2pPort: 6001,              // WebSocket P2P port
        apiPort: 3001,              // REST API port
        initialPeers: [],           // Initial peer nodes to connect
    },

    // Storage settings
    storage: {
        dataDir: './data',          // Data storage directory
        blocksFile: 'blocks.json',
        walletsDir: 'wallets',
    },

    // API settings
    api: {
        rateLimit: {
            windowMs: 60000,          // 1 minute
            maxRequests: 100,         // Max requests per window
        },
        cors: {
            origin: '*',              // CORS origin
        },
    },
};

export type Config = typeof config;
