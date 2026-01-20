/**
 * Full Node Role
 * Participates in P2P, pool/AMM, governance. No API, no block production.
 */

import { RoleConfig } from './types.js';

export const fullRole: RoleConfig = {
    name: 'full',
    description: 'Full node: P2P participant with pool and governance access',
    services: {
        apiServer: false,
        p2p: true,
        blockProduction: false,
        staking: false,
        poolAmm: true,
        governance: true,
    },
};
