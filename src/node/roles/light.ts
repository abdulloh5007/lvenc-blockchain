/**
 * Light Node Role
 * Minimal resource usage. Headers-only P2P sync. No services enabled.
 */

import { RoleConfig } from './types.js';

export const lightRole: RoleConfig = {
    name: 'light',
    description: 'Light node: headers-only sync, minimal resource usage',
    services: {
        apiServer: false,
        p2p: 'headers_only',
        blockProduction: false,
        staking: false,
        poolAmm: false,
        governance: false,
    },
};
