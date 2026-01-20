/**
 * Transaction Validation Middleware
 * 
 * Stateless API-level pre-validation to protect mempool from spam/invalid transactions.
 * All checks are deterministic and do not modify blockchain state.
 */

import { Request, Response, NextFunction } from 'express';
import * as ed from '@noble/ed25519';
import { sha256 } from '../../../protocol/utils/crypto.js';
import { nonceManager } from '../../../protocol/security/nonce-manager.js';
import { chainParams } from '../../../protocol/params/index.js';
import { logger } from '../../../protocol/utils/logger.js';

const log = logger.child('TxValidation');

// ========== PROTOCOL LIMITS ==========
const MAX_TX_SIZE_BYTES = 16 * 1024;  // 16 KB max transaction size
const VALID_TX_TYPES = ['TRANSFER', 'STAKE', 'UNSTAKE', 'DELEGATE', 'UNDELEGATE', 'CLAIM_REWARD'] as const;

// ========== DUPLICATE TX CACHE ==========
// In-memory cache for recent tx hashes (prevents duplicate submissions)
const recentTxHashes = new Map<string, number>();
const TX_HASH_CACHE_TTL = 60_000;  // 1 minute TTL
const MAX_CACHE_SIZE = 10_000;

function cleanupTxHashCache() {
    const now = Date.now();
    for (const [hash, timestamp] of recentTxHashes) {
        if (now - timestamp > TX_HASH_CACHE_TTL) {
            recentTxHashes.delete(hash);
        }
    }
}

// Cleanup every 30 seconds
setInterval(cleanupTxHashCache, 30_000);

// ========== RATE LIMITING ==========
interface RateLimitEntry {
    count: number;
    resetAt: number;
}

const rateLimits = {
    perIp: new Map<string, RateLimitEntry>(),
    perAddress: new Map<string, RateLimitEntry>(),
};

const RATE_LIMIT_WINDOW = 60_000;  // 1 minute
const MAX_TX_PER_IP = 30;          // 30 tx/min per IP
const MAX_TX_PER_ADDRESS = 10;     // 10 tx/min per address

function checkRateLimit(key: string, map: Map<string, RateLimitEntry>, maxCount: number): boolean {
    const now = Date.now();
    const entry = map.get(key);

    if (!entry || now >= entry.resetAt) {
        map.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
        return true;
    }

    if (entry.count >= maxCount) {
        return false;
    }

    entry.count++;
    return true;
}

// ========== HELPER: Compute Canonical Hash ==========
function computeCanonicalHash(
    chainId: string,
    txType: string,
    from: string,
    to: string,
    amount: number,
    fee: number,
    nonce: number
): string {
    return sha256(
        chainId +
        txType +
        from +
        to +
        amount.toString() +
        fee.toString() +
        nonce.toString()
    );
}

// ========== HELPER: Hex to Bytes ==========
function hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
}

// ========== VERIFICATION RESULT ==========
interface ValidationResult {
    valid: boolean;
    error?: string;
    code?: string;
}

// ========== MAIN VALIDATION FUNCTIONS ==========

/**
 * Validate transaction structure (sync)
 */
export function validateTxStructure(body: Record<string, unknown>): ValidationResult {
    const { address, amount, signature, publicKey, nonce, chainId, signatureScheme } = body;

    // Required fields
    if (!address || typeof address !== 'string') {
        return { valid: false, error: 'address is required', code: 'MISSING_ADDRESS' };
    }
    if (amount === undefined || typeof amount !== 'number' || amount <= 0) {
        return { valid: false, error: 'amount must be positive number', code: 'INVALID_AMOUNT' };
    }
    if (!signature || typeof signature !== 'string') {
        return { valid: false, error: 'signature is required', code: 'MISSING_SIGNATURE' };
    }
    if (!publicKey || typeof publicKey !== 'string') {
        return { valid: false, error: 'publicKey is required', code: 'MISSING_PUBKEY' };
    }
    if (nonce === undefined || typeof nonce !== 'number') {
        return { valid: false, error: 'nonce is required', code: 'MISSING_NONCE' };
    }
    if (!chainId || typeof chainId !== 'string') {
        return { valid: false, error: 'chainId is required', code: 'MISSING_CHAIN_ID' };
    }

    // Ed25519 format validation
    if (signatureScheme !== 'ed25519') {
        return { valid: false, error: 'signatureScheme must be "ed25519"', code: 'INVALID_SCHEME' };
    }
    if (signature.length !== 128) {
        return { valid: false, error: 'signature must be 128 hex chars (64 bytes)', code: 'INVALID_SIG_LENGTH' };
    }
    if (publicKey.length !== 64) {
        return { valid: false, error: 'publicKey must be 64 hex chars (32 bytes)', code: 'INVALID_PUBKEY_LENGTH' };
    }

    // ChainId enforcement
    if (chainId !== chainParams.chainId) {
        return { valid: false, error: `Invalid chainId: expected ${chainParams.chainId}`, code: 'WRONG_CHAIN_ID' };
    }

    return { valid: true };
}

/**
 * Validate nonce (sync, stateless check)
 */
export function validateNonce(address: string, nonce: number): ValidationResult {
    const nonceInfo = nonceManager.getNonceInfo(address);

    // Reject stale nonce (replay attempt)
    if (nonce <= nonceInfo.lastNonce) {
        return { valid: false, error: `Stale nonce: ${nonce} <= ${nonceInfo.lastNonce}`, code: 'STALE_NONCE' };
    }

    // Reject if nonce already pending
    const validation = nonceManager.validateNonce(address, nonce);
    if (!validation.valid) {
        return { valid: false, error: validation.error, code: 'INVALID_NONCE' };
    }

    return { valid: true };
}

/**
 * Validate tx type
 */
export function validateTxType(txType: string): ValidationResult {
    if (!VALID_TX_TYPES.includes(txType as typeof VALID_TX_TYPES[number])) {
        return { valid: false, error: `Unknown txType: ${txType}`, code: 'INVALID_TX_TYPE' };
    }
    return { valid: true };
}

/**
 * Check for duplicate transaction
 */
export function checkDuplicate(txHash: string): ValidationResult {
    if (recentTxHashes.has(txHash)) {
        return { valid: false, error: 'Duplicate transaction', code: 'DUPLICATE_TX' };
    }

    // Enforce cache size limit
    if (recentTxHashes.size >= MAX_CACHE_SIZE) {
        cleanupTxHashCache();
    }

    recentTxHashes.set(txHash, Date.now());
    return { valid: true };
}

/**
 * Verify ed25519 signature (async)
 */
export async function verifyEd25519Signature(
    signature: string,
    publicKey: string,
    canonicalHash: string
): Promise<ValidationResult> {
    try {
        const signatureBytes = hexToBytes(signature);
        const publicKeyBytes = hexToBytes(publicKey);
        const hashBytes = hexToBytes(canonicalHash);

        const isValid = await ed.verifyAsync(signatureBytes, hashBytes, publicKeyBytes);

        if (!isValid) {
            return { valid: false, error: 'Invalid ed25519 signature', code: 'INVALID_SIGNATURE' };
        }

        return { valid: true };
    } catch (err) {
        return { valid: false, error: 'Signature verification failed', code: 'SIG_VERIFY_ERROR' };
    }
}

// ========== EXPRESS MIDDLEWARE ==========

/**
 * Middleware: Validate staking transaction at API level
 */
export function validateStakingTx(txType: string) {
    return async (req: Request, res: Response, next: NextFunction) => {
        const startTime = Date.now();

        // Check request size
        const contentLength = parseInt(req.headers['content-length'] || '0', 10);
        if (contentLength > MAX_TX_SIZE_BYTES) {
            log.warn(`TX rejected: size ${contentLength} > ${MAX_TX_SIZE_BYTES}`);
            res.status(400).json({ success: false, error: 'Transaction too large', code: 'TX_TOO_LARGE' });
            return;
        }

        // Rate limit by IP
        const ip = req.ip || req.socket.remoteAddress || 'unknown';
        if (!checkRateLimit(ip, rateLimits.perIp, MAX_TX_PER_IP)) {
            log.warn(`Rate limit exceeded for IP: ${ip}`);
            res.status(429).json({ success: false, error: 'Rate limit exceeded (IP)', code: 'RATE_LIMIT_IP' });
            return;
        }

        // Rate limit by address
        const address = req.body.address || req.body.delegator;
        if (address && !checkRateLimit(address, rateLimits.perAddress, MAX_TX_PER_ADDRESS)) {
            log.warn(`Rate limit exceeded for address: ${address?.slice(0, 12)}...`);
            res.status(429).json({ success: false, error: 'Rate limit exceeded (address)', code: 'RATE_LIMIT_ADDR' });
            return;
        }

        // Structure validation
        const structureResult = validateTxStructure(req.body);
        if (!structureResult.valid) {
            res.status(400).json({ success: false, ...structureResult });
            return;
        }

        // TxType validation
        const typeResult = validateTxType(txType);
        if (!typeResult.valid) {
            res.status(400).json({ success: false, ...typeResult });
            return;
        }

        const { signature, publicKey, nonce, chainId, amount } = req.body;
        const from = req.body.address || req.body.delegator;
        const to = req.body.validator || 'STAKE_POOL';
        const fee = req.body.fee || 0;

        // Nonce validation
        const nonceResult = validateNonce(from, nonce);
        if (!nonceResult.valid) {
            res.status(400).json({ success: false, ...nonceResult });
            return;
        }

        // Compute canonical hash
        const canonicalHash = computeCanonicalHash(chainId, txType, from, to, amount, fee, nonce);

        // Duplicate check
        const dupResult = checkDuplicate(canonicalHash);
        if (!dupResult.valid) {
            res.status(400).json({ success: false, ...dupResult });
            return;
        }

        // Ed25519 signature verification (async)
        const sigResult = await verifyEd25519Signature(signature, publicKey, canonicalHash);
        if (!sigResult.valid) {
            log.warn(`Invalid signature from ${from?.slice(0, 12)}...`);
            res.status(400).json({ success: false, ...sigResult });
            return;
        }

        // All validations passed
        log.debug(`TX validated in ${Date.now() - startTime}ms: ${txType} from ${from?.slice(0, 12)}...`);

        // Store canonical hash in request for downstream use
        (req as any).canonicalHash = canonicalHash;

        next();
    };
}

export { MAX_TX_SIZE_BYTES, VALID_TX_TYPES };
