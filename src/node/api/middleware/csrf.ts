/**
 * CSRF Protection Middleware
 * Protects API endpoints from Cross-Site Request Forgery attacks
 */

import { Request, Response, NextFunction } from 'express';
import { sha256 } from '../../../protocol/utils/crypto.js';
import { logger } from '../../../protocol/utils/logger.js';

const CSRF_TOKEN_HEADER = 'x-csrf-token';
const CSRF_COOKIE_NAME = 'csrf_secret';
const TOKEN_EXPIRY_MS = 3600000; // 1 hour

interface CSRFToken {
    secret: string;
    timestamp: number;
}

// Store active tokens (in production, use Redis or persistent storage)
const activeTokens: Map<string, CSRFToken> = new Map();

/**
 * Generate a new CSRF token for a session
 */
export function generateCSRFToken(sessionId: string): string {
    const secret = sha256(sessionId + Date.now().toString() + Math.random().toString());
    const token = sha256(secret + sessionId);

    activeTokens.set(sessionId, {
        secret,
        timestamp: Date.now(),
    });

    return token;
}

/**
 * Validate a CSRF token
 */
export function validateCSRFToken(sessionId: string, token: string): boolean {
    const stored = activeTokens.get(sessionId);

    if (!stored) {
        return false;
    }

    // Check expiry
    if (Date.now() - stored.timestamp > TOKEN_EXPIRY_MS) {
        activeTokens.delete(sessionId);
        return false;
    }

    // Validate token
    const expectedToken = sha256(stored.secret + sessionId);
    return token === expectedToken;
}

/**
 * CSRF protection middleware
 * Skips GET, HEAD, OPTIONS requests (safe methods)
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
    // Skip safe methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }

    // Skip if it's an API key authenticated request
    if (req.headers['x-api-key']) {
        return next();
    }

    // Get session ID (from cookie or generate)
    let sessionId = req.cookies?.[CSRF_COOKIE_NAME];
    if (!sessionId) {
        // For API-only usage, skip CSRF (rely on other auth)
        return next();
    }

    // Validate token
    const token = req.headers[CSRF_TOKEN_HEADER] as string;
    if (!token) {
        logger.warn(`CSRF: Missing token from ${req.ip}`);
        res.status(403).json({ error: 'CSRF token required' });
        return;
    }

    if (!validateCSRFToken(sessionId, token)) {
        logger.warn(`CSRF: Invalid token from ${req.ip}`);
        res.status(403).json({ error: 'Invalid CSRF token' });
        return;
    }

    next();
}

/**
 * Middleware to set CSRF cookie and provide token endpoint
 */
export function csrfCookieSetter(req: Request, res: Response, next: NextFunction): void {
    let sessionId = req.cookies?.[CSRF_COOKIE_NAME];

    if (!sessionId) {
        sessionId = sha256(req.ip + Date.now().toString() + Math.random().toString());
        res.cookie(CSRF_COOKIE_NAME, sessionId, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: TOKEN_EXPIRY_MS,
        });
    }

    // Attach token generator to response
    (res as any).generateCSRFToken = () => generateCSRFToken(sessionId);

    next();
}

/**
 * Cleanup expired tokens
 */
export function cleanupExpiredTokens(): void {
    const now = Date.now();
    for (const [sessionId, token] of activeTokens) {
        if (now - token.timestamp > TOKEN_EXPIRY_MS) {
            activeTokens.delete(sessionId);
        }
    }
}

// Cleanup every 10 minutes
setInterval(cleanupExpiredTokens, 600000);
