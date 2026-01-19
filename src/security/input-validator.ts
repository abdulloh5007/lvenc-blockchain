/**
 * Input Validator
 * JSON schema validation for API inputs to prevent injection and malformed data
 */

import { logger } from '../utils/logger.js';

// Maximum allowed lengths
const MAX_ADDRESS_LENGTH = 50;
const MAX_STRING_LENGTH = 256;
const MAX_MEMO_LENGTH = 512;
const MAX_ARRAY_LENGTH = 100;

// Address format regex
const ADDRESS_REGEX = /^(LVE|tLVE)[a-fA-F0-9]{40}$/;
const TX_ID_REGEX = /^[a-fA-F0-9-]{36}$/;
const BLOCK_HASH_REGEX = /^[a-fA-F0-9]{64}$/;

interface ValidationResult {
    valid: boolean;
    error?: string;
}

export class InputValidator {
    private log = logger.child('InputValidator');

    /**
     * Validate address format
     */
    validateAddress(address: unknown, fieldName: string = 'address'): ValidationResult {
        if (typeof address !== 'string') {
            return { valid: false, error: `${fieldName} must be a string` };
        }
        if (address.length > MAX_ADDRESS_LENGTH) {
            return { valid: false, error: `${fieldName} too long` };
        }
        if (!ADDRESS_REGEX.test(address)) {
            return { valid: false, error: `${fieldName} invalid format (expected LVE or tLVE prefix)` };
        }
        return { valid: true };
    }

    /**
     * Validate positive number
     */
    validateAmount(amount: unknown, fieldName: string = 'amount'): ValidationResult {
        if (typeof amount !== 'number') {
            return { valid: false, error: `${fieldName} must be a number` };
        }
        if (!Number.isFinite(amount)) {
            return { valid: false, error: `${fieldName} must be finite` };
        }
        if (amount < 0) {
            return { valid: false, error: `${fieldName} must be non-negative` };
        }
        if (amount > Number.MAX_SAFE_INTEGER) {
            return { valid: false, error: `${fieldName} exceeds maximum safe value` };
        }
        return { valid: true };
    }

    /**
     * Validate string with max length
     */
    validateString(str: unknown, fieldName: string, maxLength: number = MAX_STRING_LENGTH): ValidationResult {
        if (typeof str !== 'string') {
            return { valid: false, error: `${fieldName} must be a string` };
        }
        if (str.length > maxLength) {
            return { valid: false, error: `${fieldName} too long (max ${maxLength})` };
        }
        // Check for control characters (potential injection)
        if (/[\x00-\x1f\x7f]/.test(str)) {
            return { valid: false, error: `${fieldName} contains invalid characters` };
        }
        return { valid: true };
    }

    /**
     * Validate transaction input
     */
    validateTransaction(data: unknown): ValidationResult {
        if (!data || typeof data !== 'object') {
            return { valid: false, error: 'Transaction data must be an object' };
        }

        const tx = data as Record<string, unknown>;

        // Required fields
        if (!tx.toAddress) {
            return { valid: false, error: 'toAddress is required' };
        }
        const toResult = this.validateAddress(tx.toAddress, 'toAddress');
        if (!toResult.valid) return toResult;

        if (tx.fromAddress !== null && tx.fromAddress !== undefined) {
            const fromResult = this.validateAddress(tx.fromAddress, 'fromAddress');
            if (!fromResult.valid) return fromResult;
        }

        const amountResult = this.validateAmount(tx.amount, 'amount');
        if (!amountResult.valid) return amountResult;

        if (tx.fee !== undefined) {
            const feeResult = this.validateAmount(tx.fee, 'fee');
            if (!feeResult.valid) return feeResult;
        }

        if (tx.chainId !== undefined) {
            const chainResult = this.validateString(tx.chainId, 'chainId', 20);
            if (!chainResult.valid) return chainResult;
        }

        return { valid: true };
    }

    /**
     * Validate staking input
     */
    validateStaking(data: unknown): ValidationResult {
        if (!data || typeof data !== 'object') {
            return { valid: false, error: 'Staking data must be an object' };
        }

        const stake = data as Record<string, unknown>;

        const addrResult = this.validateAddress(stake.address, 'address');
        if (!addrResult.valid) return addrResult;

        const amountResult = this.validateAmount(stake.amount, 'amount');
        if (!amountResult.valid) return amountResult;

        return { valid: true };
    }

    /**
     * Validate pool swap input
     */
    validateSwap(data: unknown): ValidationResult {
        if (!data || typeof data !== 'object') {
            return { valid: false, error: 'Swap data must be an object' };
        }

        const swap = data as Record<string, unknown>;

        const tokenFrom = swap.tokenFrom || swap.from;
        if (typeof tokenFrom !== 'string' || !['LVE', 'UZS', 'lve', 'uzs'].includes(tokenFrom)) {
            return { valid: false, error: 'tokenFrom must be LVE or UZS' };
        }

        const amountResult = this.validateAmount(swap.amount, 'amount');
        if (!amountResult.valid) return amountResult;

        if (swap.minOut !== undefined) {
            const minOutResult = this.validateAmount(swap.minOut, 'minOut');
            if (!minOutResult.valid) return minOutResult;
        }

        return { valid: true };
    }

    /**
     * Sanitize string input
     */
    sanitize(input: string): string {
        return input
            .replace(/[\x00-\x1f\x7f]/g, '') // Remove control chars
            .trim()
            .slice(0, MAX_STRING_LENGTH);
    }
}

export const inputValidator = new InputValidator();
