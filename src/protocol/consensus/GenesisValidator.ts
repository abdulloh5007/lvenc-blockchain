/**
 * Genesis Validators
 * 
 * Defines validators that are active from block 0.
 * These bypass the pending queue and can produce blocks immediately.
 */

export interface GenesisValidator {
    // Stable validator identifier (wallet address format)
    operatorAddress: string;
    // Ed25519 public key for block signing (hex)
    consensusPubKey: string;
    // Initial voting power (typically = initial stake)
    power: number;
    // Human-readable name (optional)
    moniker?: string;
}

export interface GenesisConfig {
    chainId: string;
    genesisTime: number;
    // Initial account balances
    initialBalances: Array<{
        address: string;
        amount: number;
    }>;
    // Genesis validators (bootstrap the network)
    validators: GenesisValidator[];
    // Epoch parameters
    epochParams: {
        blocksPerEpoch: number;
        minValidatorEpochs: number;  // Genesis validators cannot exit before this
    };
}

/**
 * Load genesis config from file
 */
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger.js';

const log = logger.child('Genesis');

export function loadGenesisConfig(dataDir: string): GenesisConfig | null {
    const genesisPath = path.join(dataDir, 'genesis.json');

    if (!fs.existsSync(genesisPath)) {
        log.debug('No genesis.json found (will sync from peers)');
        return null;
    }

    try {
        const data = fs.readFileSync(genesisPath, 'utf-8');
        const config: GenesisConfig = JSON.parse(data);
        log.info(`● Genesis loaded: chainId=${config.chainId}, validators=${config.validators.length}`);
        return config;
    } catch (error) {
        log.error(`Failed to load genesis.json: ${error}`);
        return null;
    }
}

/**
 * Save genesis config to file
 */
export function saveGenesisConfig(dataDir: string, config: GenesisConfig): void {
    const genesisPath = path.join(dataDir, 'genesis.json');

    // Ensure directory exists
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    fs.writeFileSync(genesisPath, JSON.stringify(config, null, 2));
    log.info(`● Genesis saved: ${genesisPath}`);
}

/**
 * Create default genesis config
 */
export function createDefaultGenesis(
    chainId: string,
    faucetAddress: string,
    faucetAmount: number,
    validatorPubKey?: string,
    validatorPower?: number
): GenesisConfig {
    const config: GenesisConfig = {
        chainId,
        genesisTime: Date.now(),
        initialBalances: [
            { address: faucetAddress, amount: faucetAmount }
        ],
        validators: [],
        epochParams: {
            blocksPerEpoch: 100,
            minValidatorEpochs: 1
        }
    };

    // Add genesis validator if pubkey provided
    if (validatorPubKey && validatorPower) {
        config.validators.push({
            operatorAddress: faucetAddress,  // Same as faucet for simplicity
            consensusPubKey: validatorPubKey,
            power: validatorPower,
            moniker: 'genesis-validator'
        });
    }

    return config;
}
