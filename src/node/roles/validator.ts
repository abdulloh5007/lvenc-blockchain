/**
 * Validator Node Role
 * Full block production capabilities with staking, pool, governance.
 */

import { RoleConfig } from './types.js';

export const validatorRole: RoleConfig = {
    name: 'validator',
    description: 'Validator node: block production, staking, full network participation',
    services: {
        apiServer: false,
        p2p: true,
        blockProduction: true,
        staking: true,
        poolAmm: true,
        governance: true,
    },
};
