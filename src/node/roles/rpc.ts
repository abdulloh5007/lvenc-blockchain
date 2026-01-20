/**
 * RPC Node Role
 * API server for external queries. Read-only access to pool and governance.
 */

import { RoleConfig } from './types.js';

export const rpcRole: RoleConfig = {
    name: 'rpc',
    description: 'RPC node: API server for external queries, read-only state access',
    services: {
        apiServer: true,
        p2p: true,
        blockProduction: false,
        staking: false,
        poolAmm: 'read_only',
        governance: 'read_only',
    },
};
