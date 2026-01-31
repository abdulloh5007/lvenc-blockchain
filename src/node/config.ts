import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const isTestnet = process.env.NETWORK_MODE !== 'mainnet';

// Read version from package.json dynamically
function getPackageVersion(): string {
    try {
        // Handle ESM module path resolution
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);
        const pkgPath = join(__dirname, '../../package.json');
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        return pkg.version || '0.0.0';
    } catch {
        return '0.0.0';
    }
}

// Read economic spec
function getEconomicSpec() {
    try {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);
        // Assuming compiled structure mirrors src, root is up 2 levels
        // src/node/config.ts -> root/
        // But if running from strict structure, we check typical locations
        const specPath = join(__dirname, '../../pos_economic_spec_v1.json');
        return JSON.parse(readFileSync(specPath, 'utf-8'));
    } catch (e) {
        console.warn('⚠️ Could not load pos_economic_spec_v1.json, using defaults.');
        return {
            economics: {
                inflation: { rate: 0.006 },
                epoch: { duration_blocks: 100 }
            }
        };
    }
}

const ECONOMIC_SPEC = getEconomicSpec();

// Fixed genesis configuration for network consistency
// ALL nodes must use these values to have same genesis hash
const GENESIS_CONFIG = {
    // Fixed testnet faucet address (can be overridden for private testnets)
    testnetFaucetAddress: process.env.GENESIS_ADDRESS || 'tLVE0000000000000000000000000000000000000001',
    mainnetFaucetAddress: process.env.GENESIS_ADDRESS || 'LVE0000000000000000000000000000000000000001',
    // Genesis Public Key (required for bootstrapping PoS)
    testnetFaucetPublicKey: process.env.GENESIS_PUBLIC_KEY || '',
    mainnetFaucetPublicKey: process.env.GENESIS_PUBLIC_KEY || '',
    // Fixed timestamp (January 1, 2026 00:00:00 UTC)
    timestamp: 1767225600000,
};

// Protocol Version Control
// Increment PROTOCOL_VERSION on breaking changes, update MIN_PROTOCOL_VERSION to enforce upgrades
const VERSION_CONFIG = {
    // Software version (from package.json)
    nodeVersion: getPackageVersion(),
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
    // Chain ID for transaction replay protection
    chainId: isTestnet ? 'lvenc-testnet-1' : 'lvenc-mainnet-1',
    blockchain: {
        // PoS Configuration
        validatorReward: 0, // Dynamic (Inflation-based)
        genesisAmount: 70_000_000,
        coinName: isTestnet ? 'tLVE' : 'LVE',
        coinSymbol: isTestnet ? 'tLVE' : 'LVE',
        addressPrefix: isTestnet ? 'tLVE' : 'LVE',
        maxTxPerBlock: 10,
        maxPendingTx: 100,
        minFee: 0.1,
    },
    network: {
        p2pPort: 6001,
        apiPort: 3001,
        // Bootstrap nodes for testnet (add your seed nodes here)
        bootstrapNodes: isTestnet ? [
            // 'ws://seed1.lvenc.io:6001',
            // 'ws://seed2.lvenc.io:6001',
        ] : [],
        initialPeers: [],
    },
    // Pool configuration
    pool: {
        initialLVE: 100_000,        // 100K LVE
        initialUSDT: 5_000,      // 5M UZS = 1 LVE = 50 UZS
        feePercent: 0.3,            // 0.3% swap fee
        burnPercent: 30,            // 30% of fees burned
    },
    // Staking configuration
    staking: {
        minValidatorStake: 100,       // Min self-stake to become validator (100 LVE)
        maxConcentration: 33,         // Max % of total stake for one validator (33%)
        minCommission: ECONOMIC_SPEC.economics.rewards.validator_commission_min || 0,
        maxCommission: ECONOMIC_SPEC.economics.rewards.validator_commission_max || 30,
        epochDuration: ECONOMIC_SPEC.economics.epoch.duration_blocks || 100,
    },
    // New Economic Variables
    economics: {
        inflationRate: ECONOMIC_SPEC.economics.inflation.rate || 0.006,
        schedule: ECONOMIC_SPEC.economics.minting_schedule || 'per_epoch'
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
        faucetPublicKey: isTestnet ? GENESIS_CONFIG.testnetFaucetPublicKey : GENESIS_CONFIG.mainnetFaucetPublicKey,
        timestamp: GENESIS_CONFIG.timestamp,
    },
    // Version control (for mandatory updates)
    version: VERSION_CONFIG,
    // Sync configuration
    sync: SYNC_CONFIG,
};
export type Config = typeof config;
