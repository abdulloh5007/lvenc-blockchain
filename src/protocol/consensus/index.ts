/**
 * Consensus Module Exports
 */

export {
    ValidatorKey,
    initValidatorKey,
    getValidatorKey,
    deriveAddressFromPubKey,
    VALIDATOR_KEY_FILE,
    VALIDATOR_KEY_VERSION
} from './ValidatorKey.js';

export type { ValidatorKeyData } from './ValidatorKey.js';

export {
    loadGenesisConfig,
    saveGenesisConfig,
    createDefaultGenesis
} from './GenesisValidator.js';

export type { GenesisValidator, GenesisConfig } from './GenesisValidator.js';
