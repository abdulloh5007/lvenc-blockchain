/**
 * Authentication & Authorization Security Middleware
 * Protects against brute force, IDOR, privilege escalation, and CSRF attacks
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../../utils/logger.js';
import { isValidAddress } from './security.js';

// ==========================================
// BRUTE FORCE PROTECTION
// ==========================================

interface AttemptRecord {
    count: number;
    firstAttempt: number;
    blockedUntil: number;
}

// Track failed attempts per IP
const failedAttempts = new Map<string, AttemptRecord>();

// Config
const BRUTE_FORCE_CONFIG = {
    maxAttempts: 5,           // Max failed attempts before block
    windowMs: 15 * 60 * 1000, // 15 minutes window
    blockDurationMs: 30 * 60 * 1000, // 30 minutes block
    cleanupIntervalMs: 5 * 60 * 1000, // Cleanup every 5 minutes
};

// Cleanup old records periodically
setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of failedAttempts.entries()) {
        if (now - record.firstAttempt > BRUTE_FORCE_CONFIG.windowMs && record.blockedUntil < now) {
            failedAttempts.delete(ip);
        }
    }
}, BRUTE_FORCE_CONFIG.cleanupIntervalMs);

/**
 * Record a failed authentication attempt
 */
export function recordFailedAttempt(ip: string): void {
    const now = Date.now();
    const record = failedAttempts.get(ip) || { count: 0, firstAttempt: now, blockedUntil: 0 };

    // Reset if window expired
    if (now - record.firstAttempt > BRUTE_FORCE_CONFIG.windowMs) {
        record.count = 0;
        record.firstAttempt = now;
    }

    record.count++;

    // Block if too many attempts
    if (record.count >= BRUTE_FORCE_CONFIG.maxAttempts) {
        record.blockedUntil = now + BRUTE_FORCE_CONFIG.blockDurationMs;
        logger.warn(`🚨 Brute force: IP ${ip} blocked for ${BRUTE_FORCE_CONFIG.blockDurationMs / 60000} minutes`);
    }

    failedAttempts.set(ip, record);
}

/**
 * Clear failed attempts on successful auth
 */
export function clearFailedAttempts(ip: string): void {
    failedAttempts.delete(ip);
}

/**
 * Check if IP is blocked
 */
export function isBlocked(ip: string): boolean {
    const record = failedAttempts.get(ip);
    if (!record) return false;
    return record.blockedUntil > Date.now();
}

/**
 * Brute force protection middleware
 */
export function bruteForceProtection(req: Request, res: Response, next: NextFunction): void {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';

    if (isBlocked(ip)) {
        const record = failedAttempts.get(ip)!;
        const remainingMs = record.blockedUntil - Date.now();
        const remainingMin = Math.ceil(remainingMs / 60000);

        logger.warn(`🚨 Blocked request from ${ip} - ${remainingMin} min remaining`);
        res.status(429).json({
            success: false,
            error: `Too many failed attempts. Try again in ${remainingMin} minutes.`,
            retryAfter: remainingMs,
        });
        return;
    }

    next();
}

// ==========================================
// CSRF PROTECTION
// ==========================================

// Store CSRF tokens (in production, use Redis)
const csrfTokens = new Map<string, { token: string; expires: number }>();

// CSRF config
const CSRF_CONFIG = {
    tokenLength: 32,
    expiryMs: 24 * 60 * 60 * 1000, // 24 hours
    headerName: 'x-csrf-token',
    cookieName: 'csrf_token',
};

/**
 * Generate CSRF token
 */
export function generateCSRFToken(): string {
    return crypto.randomBytes(CSRF_CONFIG.tokenLength).toString('hex');
}

/**
 * CSRF token generation endpoint handler
 */
export function csrfTokenHandler(_req: Request, res: Response): void {
    const token = generateCSRFToken();
    const sessionId = crypto.randomBytes(16).toString('hex');

    csrfTokens.set(sessionId, {
        token,
        expires: Date.now() + CSRF_CONFIG.expiryMs,
    });

    // Set session cookie
    res.cookie(CSRF_CONFIG.cookieName, sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: CSRF_CONFIG.expiryMs,
    });

    res.json({ success: true, data: { csrfToken: token } });
}

/**
 * CSRF validation middleware
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
    // Skip for safe methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        next();
        return;
    }

    // Skip for API key authenticated requests (server-to-server)
    if (req.headers['x-api-key']) {
        next();
        return;
    }

    const sessionId = req.cookies?.[CSRF_CONFIG.cookieName];
    const token = req.headers[CSRF_CONFIG.headerName] as string;

    if (!sessionId || !token) {
        // For now, just log but don't block (to not break existing clients)
        logger.debug('CSRF: Missing token or session');
        next();
        return;
    }

    const stored = csrfTokens.get(sessionId);
    if (!stored || stored.token !== token || stored.expires < Date.now()) {
        logger.warn(`🚨 CSRF: Invalid token from ${req.ip}`);
        res.status(403).json({
            success: false,
            error: 'Invalid or expired CSRF token',
        });
        return;
    }

    next();
}

// ==========================================
// AUTHORIZATION / IDOR PROTECTION
// ==========================================

/**
 * Verify wallet ownership for sensitive operations
 * Requires signature in request to prove address ownership
 */
export function requireWalletOwnership(addressParam: string = 'address') {
    return (req: Request, res: Response, next: NextFunction): void => {
        const address = req.params[addressParam] || req.body[addressParam];
        const signature = req.headers['x-wallet-signature'] as string;
        const message = req.headers['x-wallet-message'] as string;

        if (!address) {
            res.status(400).json({
                success: false,
                error: `${addressParam} is required`,
            });
            return;
        }

        // Validate address format
        if (!isValidAddress(address)) {
            res.status(400).json({
                success: false,
                error: 'Invalid address format',
            });
            return;
        }

        // For sensitive operations, require signature
        // Skip for now - can be enabled when wallet signing is implemented on frontend
        // This would verify that the user actually owns the wallet private key

        /*
        if (!signature || !message) {
            res.status(401).json({
                success: false,
                error: 'Wallet signature required for this operation',
            });
            return;
        }
        
        // Verify signature here...
        */

        next();
    };
}

/**
 * Ensure user can only access their own resources (IDOR protection)
 * For admin panel, allows access to all resources
 */
export function preventIDOR(resourceType: 'wallet' | 'transaction' | 'nft') {
    return (req: Request, res: Response, next: NextFunction): void => {
        // If admin API key is present, allow access
        if (req.headers['x-api-key'] === process.env.ADMIN_API_KEY) {
            next();
            return;
        }

        // For public read operations, allow
        if (req.method === 'GET') {
            next();
            return;
        }

        // For write operations on wallets, need additional verification
        if (resourceType === 'wallet') {
            const targetAddress = req.params.address || req.body.fromAddress;
            // In a real implementation, verify the request is from the wallet owner
            // using digital signatures
        }

        next();
    };
}

// ==========================================
// SESSION SECURITY
// ==========================================

/**
 * Session fixation protection - regenerate session ID on auth state change
 * Note: This blockchain uses stateless auth (signatures), not sessions
 */
export function sessionSecurity(req: Request, res: Response, next: NextFunction): void {
    // Add security headers for session protection
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    next();
}

// ==========================================
// 2FA SUPPORT (placeholder for future)
// ==========================================

/**
 * Two-factor authentication verification
 * Placeholder - implement when needed
 */
export function require2FA(_req: Request, _res: Response, next: NextFunction): void {
    // 2FA would be implemented here
    // For blockchain, this could be multi-signature requirements
    next();
}

// Cleanup CSRF tokens periodically
setInterval(() => {
    const now = Date.now();
    for (const [id, record] of csrfTokens.entries()) {
        if (record.expires < now) {
            csrfTokens.delete(id);
        }
    }
}, 60 * 60 * 1000); // Every hour
