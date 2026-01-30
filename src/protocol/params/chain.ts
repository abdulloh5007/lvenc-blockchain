/**
 * Chain Parameters (Protocol Level)
 * 
 * Deterministic chain-wide constants accessible to runtime modules.
 * These parameters are network-wide and do NOT depend on node-local configuration.
 * 
 * ALLOWED:
 * - Chain constants (IDs, prefixes)
 * - Consensus parameters (slot duration, epoch length)
 * - Economic parameters (fees, burn rates)
 * - Network-wide flags (isTestnet)
 * 
 * NOT ALLOWED:
 * - Ports, API settings (node-local)
 * - Logging, metrics (node-local)
 * - File paths (node-local)
 */

// Network mode - determined at startup, immutable during runtime
const isTestnet = process.env.NETWORK_MODE !== 'mainnet';

// Chain identification
export const chainParams = {
    // Network mode
    isTestnet,
    networkMode: isTestnet ? 'testnet' : 'mainnet',

    // Chain ID for transaction replay protection
    chainId: isTestnet ? 'lvenc-testnet-1' : 'lvenc-mainnet-1',

    // Address prefixes
    addressPrefix: isTestnet ? 'tLVE' : 'LVE',
    coinName: isTestnet ? 'tLVE' : 'LVE',
    coinSymbol: isTestnet ? 'tLVE' : 'LVE',

    // Consensus parameters
    slotDuration: 30000, // 30 seconds
    epochBlocks: 2880,   // ~24 hours at 30s blocks

    // Staking parameters
    staking: {
        minActiveValidators: 1,       // Network liveness: minimum active validators
        minValidatorSelfStake: 100,   // Minimum self-stake to become validator
        minDelegation: 10,            // Minimum delegation amount
        slashPercent: 50,             // Slash percentage for double-sign
        defaultCommission: 10,        // Default validator commission %
        epochDuration: 100,           // Blocks per epoch

        // Unbonding period (funds locked after unstake)
        unbondingEpochs: isTestnet ? 3 : 21,  // 3 epochs testnet, 21 mainnet (~7 days)

        // Jailing parameters
        jailDurationEpochs: isTestnet ? 2 : 7,  // How long validator is jailed
        maxJailCount: 3,                        // Max jails before permanent ban

        // Liveness tracking (Cosmos-style)
        signedBlocksWindow: 20,       // Track last 20 slots (10 minutes)
        minSignedPerWindow: 0.5,      // Must produce 50% of assigned slots
        downtimeSlashPercent: 0.1,    // 0.1% slash for downtime
    },

    // Version protocol (for upgrade coordination)
    version: {
        protocolVersion: 1,
        minProtocolVersion: 1,
        graceUntilBlock: null as number | null,
        gracePeriodBlocks: 20160, // ~7 days
    },
} as const;

// Re-export individual commonly used values
export const isTestnetNetwork = chainParams.isTestnet;
export const chainId = chainParams.chainId;
export const addressPrefix = chainParams.addressPrefix;
