const isTestnet = process.env.NETWORK_MODE !== 'mainnet';
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
};
export type Config = typeof config;
