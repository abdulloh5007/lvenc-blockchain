/**
 * Node Role Types
 * Defines the interface for role-based service configuration
 */

export interface RoleConfig {
    name: string;
    description: string;
    services: {
        apiServer: boolean;
        p2p: boolean | 'headers_only';
        blockProduction: boolean;
        staking: boolean;
        poolAmm: boolean | 'read_only';
        governance: boolean | 'read_only';
    };
}

export type RoleName = 'full' | 'validator' | 'rpc' | 'light';
