import { logger } from '../utils/logger.js';

const activeTx = new Map<string, number>();
const TX_LOCK_TIMEOUT = 30000;

const commitments = new Map<string, { hash: string; expires: number; data: unknown }>();
const COMMITMENT_EXPIRY = 5 * 60 * 1000;

export const SafeMath = {
    add(a: number, b: number): number {
        const result = a + b;
        if (result > Number.MAX_SAFE_INTEGER) throw new Error('Overflow');
        return result;
    },
    sub(a: number, b: number): number {
        if (b > a) throw new Error('Underflow');
        return a - b;
    },
    mul(a: number, b: number): number {
        const result = a * b;
        if (result > Number.MAX_SAFE_INTEGER) throw new Error('Overflow');
        return result;
    },
    div(a: number, b: number): number {
        if (b === 0) throw new Error('Division by zero');
        return Math.floor(a / b);
    }
};

export function acquireTxLock(address: string): boolean {
    const now = Date.now();
    const existing = activeTx.get(address);
    if (existing && now - existing < TX_LOCK_TIMEOUT) {
        logger.warn(`🔒 Reentrancy blocked for ${address}`);
        return false;
    }
    activeTx.set(address, now);
    return true;
}

export function releaseTxLock(address: string): void {
    activeTx.delete(address);
}

export function withTxLock<T>(address: string, fn: () => T): T {
    if (!acquireTxLock(address)) throw new Error('Transaction in progress');
    try {
        return fn();
    } finally {
        releaseTxLock(address);
    }
}

export function createCommitment(id: string, dataHash: string, data: unknown): void {
    commitments.set(id, { hash: dataHash, expires: Date.now() + COMMITMENT_EXPIRY, data });
}

export function revealCommitment(id: string, dataHash: string): unknown | null {
    const commitment = commitments.get(id);
    if (!commitment) return null;
    if (Date.now() > commitment.expires) {
        commitments.delete(id);
        return null;
    }
    if (commitment.hash !== dataHash) {
        logger.warn(`🚨 Front-running attempt: hash mismatch for ${id}`);
        return null;
    }
    commitments.delete(id);
    return commitment.data;
}

export enum Role { USER = 'user', MINER = 'miner', ADMIN = 'admin' }

const addressRoles = new Map<string, Set<Role>>();

export function grantRole(address: string, role: Role): void {
    const roles = addressRoles.get(address) || new Set();
    roles.add(role);
    addressRoles.set(address, roles);
}

export function revokeRole(address: string, role: Role): void {
    addressRoles.get(address)?.delete(role);
}

export function hasRole(address: string, role: Role): boolean {
    return addressRoles.get(address)?.has(role) ?? false;
}

export function requireRole(address: string, role: Role): void {
    if (!hasRole(address, role)) throw new Error(`Missing role: ${role}`);
}

const MIN_TX_AMOUNT = 0.001;
const MAX_TX_AMOUNT = 1000000;
const MIN_FEE = 0.1;

export interface TxValidation {
    valid: boolean;
    error?: string;
}

export function validateTransaction(
    from: string | null,
    to: string,
    amount: number,
    fee: number
): TxValidation {
    if (amount < MIN_TX_AMOUNT) return { valid: false, error: `Min amount: ${MIN_TX_AMOUNT}` };
    if (amount > MAX_TX_AMOUNT) return { valid: false, error: `Max amount: ${MAX_TX_AMOUNT}` };
    if (from && fee < MIN_FEE) return { valid: false, error: `Min fee: ${MIN_FEE}` };
    if (!to || to.length < 40) return { valid: false, error: 'Invalid recipient' };
    if (from === to) return { valid: false, error: 'Cannot send to self' };
    return { valid: true };
}

setInterval(() => {
    const now = Date.now();
    for (const [id, c] of commitments) if (now > c.expires) commitments.delete(id);
    for (const [addr, time] of activeTx) if (now - time > TX_LOCK_TIMEOUT) activeTx.delete(addr);
}, 60000);
