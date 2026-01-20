/**
 * Node Roles Index
 * Role resolver and exports
 */

import { RoleConfig, RoleName } from './types.js';
import { fullRole } from './full.js';
import { validatorRole } from './validator.js';
import { rpcRole } from './rpc.js';
import { lightRole } from './light.js';

export { RoleConfig, RoleName } from './types.js';
export { fullRole } from './full.js';
export { validatorRole } from './validator.js';
export { rpcRole } from './rpc.js';
export { lightRole } from './light.js';

const ROLES: Record<RoleName, RoleConfig> = {
    full: fullRole,
    validator: validatorRole,
    rpc: rpcRole,
    light: lightRole,
};

/**
 * Get role configuration by name
 * @param name Role name (full, validator, rpc, light)
 * @returns RoleConfig or undefined if not found
 */
export function getRole(name: string): RoleConfig | undefined {
    return ROLES[name as RoleName];
}

/**
 * Get all available role names
 */
export function getAvailableRoles(): RoleName[] {
    return Object.keys(ROLES) as RoleName[];
}

/**
 * Check if a role name is valid
 */
export function isValidRole(name: string): name is RoleName {
    return name in ROLES;
}
