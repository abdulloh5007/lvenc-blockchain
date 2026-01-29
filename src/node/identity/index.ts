/**
 * Identity Module Exports
 */

// Legacy exports (deprecated, use UnifiedIdentity)
export { NodeIdentity, initNodeIdentity, getNodeIdentity, IDENTITY_VERSION, IDENTITY_ALGO, IDENTITY_ENCODING } from './NodeIdentity.js';
export type { NodeIdentityData } from './NodeIdentity.js';

// New unified identity (v2)
export {
    UnifiedIdentity,
    initUnifiedIdentity,
    getUnifiedIdentity,
    resetUnifiedIdentity,
    UNIFIED_IDENTITY_VERSION,
    UNIFIED_IDENTITY_FILE
} from './UnifiedIdentity.js';
export type { UnifiedIdentityData } from './UnifiedIdentity.js';
