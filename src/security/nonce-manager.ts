/**
 * Nonce Manager
 * Per-address sequential nonce tracking to prevent transaction replay attacks
 * Each address has a strictly increasing nonce that must be used in order
 */

import { logger } from '../utils/logger.js';

interface NonceRecord {
    lastNonce: number;
    pendingNonces: Set<number>;
    lastUpdated: number;
}

export class NonceManager {
    private nonces: Map<string, NonceRecord> = new Map();
    private log = logger.child('NonceManager');

    /**
     * Get next valid nonce for an address
     */
    getNextNonce(address: string): number {
        const record = this.nonces.get(address);
        if (!record) {
            return 0;
        }

        // Find next available nonce (lastNonce + 1, or higher if pending)
        let next = record.lastNonce + 1;
        while (record.pendingNonces.has(next)) {
            next++;
        }
        return next;
    }

    /**
     * Validate a nonce for a transaction
     * Nonce must be >= lastNonce + 1 and not already pending
     */
    validateNonce(address: string, nonce: number): { valid: boolean; error?: string } {
        if (!Number.isInteger(nonce) || nonce < 0) {
            return { valid: false, error: 'Nonce must be a non-negative integer' };
        }

        const record = this.nonces.get(address);

        if (!record) {
            // First transaction from this address
            if (nonce !== 0) {
                return { valid: false, error: `First nonce must be 0, got ${nonce}` };
            }
            return { valid: true };
        }

        // Check if nonce is too low (replay attempt)
        if (nonce <= record.lastNonce) {
            return { valid: false, error: `Nonce ${nonce} already used (last: ${record.lastNonce})` };
        }

        // Check if nonce is already pending
        if (record.pendingNonces.has(nonce)) {
            return { valid: false, error: `Nonce ${nonce} already pending` };
        }

        // Check if gap is too large (potential attack)
        const maxGap = 100;
        if (nonce > record.lastNonce + maxGap) {
            return { valid: false, error: `Nonce gap too large (max ${maxGap})` };
        }

        return { valid: true };
    }

    /**
     * Reserve a nonce for a pending transaction
     */
    reserveNonce(address: string, nonce: number): boolean {
        const validation = this.validateNonce(address, nonce);
        if (!validation.valid) {
            this.log.warn(`Nonce validation failed for ${address.slice(0, 12)}...: ${validation.error}`);
            return false;
        }

        let record = this.nonces.get(address);
        if (!record) {
            record = { lastNonce: -1, pendingNonces: new Set(), lastUpdated: Date.now() };
            this.nonces.set(address, record);
        }

        record.pendingNonces.add(nonce);
        record.lastUpdated = Date.now();
        return true;
    }

    /**
     * Confirm a nonce (transaction included in block)
     */
    confirmNonce(address: string, nonce: number): void {
        const record = this.nonces.get(address);
        if (!record) {
            this.nonces.set(address, {
                lastNonce: nonce,
                pendingNonces: new Set(),
                lastUpdated: Date.now()
            });
            return;
        }

        record.pendingNonces.delete(nonce);

        // Update lastNonce to highest confirmed
        if (nonce > record.lastNonce) {
            record.lastNonce = nonce;
        }
        record.lastUpdated = Date.now();
    }

    /**
     * Cancel a pending nonce (transaction failed/dropped)
     */
    cancelNonce(address: string, nonce: number): void {
        const record = this.nonces.get(address);
        if (record) {
            record.pendingNonces.delete(nonce);
        }
    }

    /**
     * Get nonce info for an address
     */
    getNonceInfo(address: string): { lastNonce: number; nextNonce: number; pendingCount: number } {
        const record = this.nonces.get(address);
        if (!record) {
            return { lastNonce: -1, nextNonce: 0, pendingCount: 0 };
        }
        return {
            lastNonce: record.lastNonce,
            nextNonce: this.getNextNonce(address),
            pendingCount: record.pendingNonces.size,
        };
    }

    /**
     * Load nonces from blockchain state
     */
    loadFromBlockchain(addressNonces: Map<string, number>): void {
        for (const [address, nonce] of addressNonces) {
            this.nonces.set(address, {
                lastNonce: nonce,
                pendingNonces: new Set(),
                lastUpdated: Date.now(),
            });
        }
        this.log.info(`Loaded nonces for ${addressNonces.size} addresses`);
    }

    /**
     * Cleanup old pending nonces (stale transactions)
     */
    cleanup(maxAgeMs: number = 3600000): void {
        const now = Date.now();
        for (const [address, record] of this.nonces) {
            if (record.pendingNonces.size > 0 && now - record.lastUpdated > maxAgeMs) {
                record.pendingNonces.clear();
                this.log.debug(`Cleared stale pending nonces for ${address.slice(0, 12)}...`);
            }
        }
    }
}

export const nonceManager = new NonceManager();
