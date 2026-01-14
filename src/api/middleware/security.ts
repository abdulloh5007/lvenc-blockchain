/**
 * Security Middleware - Input Validation & Sanitization
 * Protects against injection attacks, XSS, and malicious input
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../../utils/logger.js';

// Dangerous patterns for injection detection
const INJECTION_PATTERNS = [
    // SQL Injection patterns
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|TRUNCATE)\b)/gi,
    /('|"|;|--|\*|\/\*|\*\/)/g,

    // NoSQL Injection patterns
    /(\$where|\$gt|\$lt|\$ne|\$regex|\$or|\$and)/gi,

    // OS Command Injection patterns
    /(;|\||`|\$\(|&&|\|\|)/g,
    /(\b(cat|ls|rm|mv|cp|wget|curl|bash|sh|chmod|chown|sudo)\b)/gi,

    // Path Traversal
    /(\.\.\/|\.\.\\)/g,

    // Script injection
    /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
];

// Max lengths for different field types
const MAX_LENGTHS = {
    address: 50,      // EDU addresses
    hash: 128,        // Transaction/block hashes
    name: 100,        // Collection/wallet names
    description: 1000,// Descriptions
    symbol: 10,       // Token symbols
    mnemonic: 500,    // Seed phrases (24 words)
    label: 50,        // Labels
    default: 256,     // Default max length
};

/**
 * Check string for injection patterns
 */
function containsInjection(value: string): boolean {
    for (const pattern of INJECTION_PATTERNS) {
        if (pattern.test(value)) {
            return true;
        }
        // Reset regex lastIndex for global patterns
        pattern.lastIndex = 0;
    }
    return false;
}

/**
 * Sanitize a string value
 */
function sanitizeString(value: string, maxLength: number = MAX_LENGTHS.default): string {
    // Trim and limit length
    let sanitized = value.trim().substring(0, maxLength);

    // Remove null bytes
    sanitized = sanitized.replace(/\0/g, '');

    // Encode HTML entities (prevent XSS)
    sanitized = sanitized
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');

    return sanitized;
}

/**
 * Validate and sanitize request body recursively
 */
function validateAndSanitize(obj: Record<string, unknown>, path: string = ''): Record<string, unknown> | null {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
        const fullPath = path ? `${path}.${key}` : key;

        // Validate key name (prevent prototype pollution)
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            logger.warn(`🚨 Security: Blocked prototype pollution attempt at ${fullPath}`);
            return null;
        }

        if (typeof value === 'string') {
            // Check for injection patterns
            if (containsInjection(value)) {
                logger.warn(`🚨 Security: Blocked potential injection at ${fullPath}`);
                return null;
            }

            // Determine max length based on key name
            let maxLength = MAX_LENGTHS.default;
            if (key.includes('address')) maxLength = MAX_LENGTHS.address;
            else if (key.includes('hash') || key === 'id') maxLength = MAX_LENGTHS.hash;
            else if (key === 'name' || key === 'label') maxLength = MAX_LENGTHS.name;
            else if (key === 'description') maxLength = MAX_LENGTHS.description;
            else if (key === 'symbol') maxLength = MAX_LENGTHS.symbol;
            else if (key === 'mnemonic') maxLength = MAX_LENGTHS.mnemonic;

            result[key] = sanitizeString(value, maxLength);

        } else if (typeof value === 'number') {
            // Validate number range
            if (!Number.isFinite(value)) {
                logger.warn(`🚨 Security: Invalid number at ${fullPath}`);
                return null;
            }
            result[key] = value;

        } else if (typeof value === 'boolean') {
            result[key] = value;

        } else if (value === null) {
            result[key] = null;

        } else if (Array.isArray(value)) {
            // Limit array size
            if (value.length > 1000) {
                logger.warn(`🚨 Security: Array too large at ${fullPath}`);
                return null;
            }
            const sanitizedArray: unknown[] = [];
            for (let i = 0; i < value.length; i++) {
                const item = value[i];
                if (typeof item === 'object' && item !== null) {
                    const sanitized = validateAndSanitize(item as Record<string, unknown>, `${fullPath}[${i}]`);
                    if (sanitized === null) return null;
                    sanitizedArray.push(sanitized);
                } else if (typeof item === 'string') {
                    if (containsInjection(item)) return null;
                    sanitizedArray.push(sanitizeString(item));
                } else {
                    sanitizedArray.push(item);
                }
            }
            result[key] = sanitizedArray;

        } else if (typeof value === 'object') {
            const sanitized = validateAndSanitize(value as Record<string, unknown>, fullPath);
            if (sanitized === null) return null;
            result[key] = sanitized;
        }
    }

    return result;
}

/**
 * Validate blockchain address format
 */
export function isValidAddress(address: string): boolean {
    // EDU addresses start with "EDU" followed by 40 hex characters
    return /^EDU[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Validate transaction/block hash format
 */
export function isValidHash(hash: string): boolean {
    // SHA-256 hash: 64 hex characters
    return /^[a-fA-F0-9]{64}$/.test(hash);
}

/**
 * Input validation middleware
 */
export function inputValidation(req: Request, res: Response, next: NextFunction): void {
    // Validate body for POST/PUT/PATCH requests
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
        const sanitized = validateAndSanitize(req.body);
        if (sanitized === null) {
            logger.warn(`🚨 Security: Blocked malicious request to ${req.path} from ${req.ip}`);
            res.status(400).json({
                success: false,
                error: 'Invalid request: potentially malicious input detected',
            });
            return;
        }
        req.body = sanitized;
    }

    // Validate URL parameters
    for (const [key, value] of Object.entries(req.params)) {
        if (typeof value === 'string' && containsInjection(value)) {
            logger.warn(`🚨 Security: Blocked malicious param ${key} from ${req.ip}`);
            res.status(400).json({
                success: false,
                error: 'Invalid request parameter',
            });
            return;
        }
    }

    // Validate query parameters
    for (const [key, value] of Object.entries(req.query)) {
        if (typeof value === 'string' && containsInjection(value)) {
            logger.warn(`🚨 Security: Blocked malicious query ${key} from ${req.ip}`);
            res.status(400).json({
                success: false,
                error: 'Invalid query parameter',
            });
            return;
        }
    }

    next();
}

/**
 * Security headers middleware
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
    // Prevent XSS attacks
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');

    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Content Security Policy
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'");

    // Referrer Policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Permissions Policy
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

    next();
}
