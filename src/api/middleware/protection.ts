/**
 * File, Server & DoS Protection Middleware
 * Protects against file upload attacks, SSRF, and denial of service
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../../utils/logger.js';

// ==========================================
// FILE UPLOAD PROTECTION
// ==========================================

// Allowed file types and their magic bytes
const ALLOWED_FILE_TYPES: Record<string, { mimes: string[]; magicBytes: string[] }> = {
    image: {
        mimes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        magicBytes: [
            'ffd8ffe0', 'ffd8ffe1', 'ffd8ffe2', // JPEG
            '89504e47', // PNG
            '47494638', // GIF
            '52494646', // WEBP (RIFF)
        ],
    },
    json: {
        mimes: ['application/json'],
        magicBytes: ['7b'], // {
    },
};

// Dangerous file extensions that could be web shells
const DANGEROUS_EXTENSIONS = [
    '.php', '.phtml', '.php3', '.php4', '.php5', '.phps',
    '.asp', '.aspx', '.asa', '.asax',
    '.jsp', '.jspx',
    '.cgi', '.pl', '.py', '.rb', '.sh', '.bash',
    '.exe', '.dll', '.bat', '.cmd', '.com',
    '.htaccess', '.htpasswd',
    '.config', '.ini',
];

// Max file sizes (bytes)
const MAX_FILE_SIZES: Record<string, number> = {
    image: 10 * 1024 * 1024,  // 10 MB
    json: 1 * 1024 * 1024,    // 1 MB
    default: 5 * 1024 * 1024, // 5 MB
};

/**
 * Validate file extension
 */
export function isValidFileExtension(filename: string): boolean {
    const lower = filename.toLowerCase();
    return !DANGEROUS_EXTENSIONS.some(ext => lower.endsWith(ext));
}

/**
 * Check magic bytes to verify file type
 */
export function verifyMagicBytes(buffer: Buffer, expectedType: string): boolean {
    const typeConfig = ALLOWED_FILE_TYPES[expectedType];
    if (!typeConfig) return true; // No validation for unknown types

    const hex = buffer.slice(0, 8).toString('hex').toLowerCase();
    return typeConfig.magicBytes.some(magic => hex.startsWith(magic));
}

/**
 * Sanitize filename to prevent path traversal
 */
export function sanitizeFilename(filename: string): string {
    // Remove path traversal attempts
    let safe = filename
        .replace(/\.\./g, '')           // Remove ..
        .replace(/\//g, '_')            // Replace / with _
        .replace(/\\/g, '_')            // Replace \ with _
        .replace(/\0/g, '')             // Remove null bytes
        .replace(/[<>:"|?*]/g, '_')     // Remove Windows invalid chars
        .trim();

    // Ensure it doesn't start with a dot (hidden file)
    if (safe.startsWith('.')) {
        safe = '_' + safe.slice(1);
    }

    // Limit length
    if (safe.length > 255) {
        const ext = safe.slice(safe.lastIndexOf('.'));
        safe = safe.slice(0, 255 - ext.length) + ext;
    }

    return safe || 'unnamed_file';
}

/**
 * File upload validation middleware
 */
export function fileUploadProtection(allowedTypes: string[] = ['image']) {
    return (req: Request, res: Response, next: NextFunction): void => {
        // Check for file in body (base64)
        if (req.body?.data && typeof req.body.data === 'string') {
            const data = req.body.data;

            // Check for data URL format
            if (data.startsWith('data:')) {
                const mimeMatch = data.match(/^data:([^;]+);base64,/);
                if (mimeMatch) {
                    const mime = mimeMatch[1];

                    // Validate MIME type
                    const isAllowed = allowedTypes.some(type => {
                        const config = ALLOWED_FILE_TYPES[type];
                        return config && config.mimes.includes(mime);
                    });

                    if (!isAllowed) {
                        logger.warn(`🚨 File upload: Invalid MIME type ${mime} from ${req.ip}`);
                        res.status(400).json({
                            success: false,
                            error: `File type not allowed: ${mime}`,
                        });
                        return;
                    }

                    // Decode and verify magic bytes
                    try {
                        const base64Data = data.split(',')[1];
                        const buffer = Buffer.from(base64Data, 'base64');

                        // Check file size
                        const maxSize = Math.max(...allowedTypes.map(t =>
                            MAX_FILE_SIZES[t] || MAX_FILE_SIZES.default
                        ));

                        if (buffer.length > maxSize) {
                            logger.warn(`🚨 File upload: File too large (${buffer.length} bytes) from ${req.ip}`);
                            res.status(400).json({
                                success: false,
                                error: `File too large. Maximum size: ${maxSize / 1024 / 1024}MB`,
                            });
                            return;
                        }

                        // Verify magic bytes
                        const typeFromMime = allowedTypes.find(type =>
                            ALLOWED_FILE_TYPES[type]?.mimes.includes(mime)
                        );

                        if (typeFromMime && !verifyMagicBytes(buffer, typeFromMime)) {
                            logger.warn(`🚨 File upload: Magic bytes mismatch for ${mime} from ${req.ip}`);
                            res.status(400).json({
                                success: false,
                                error: 'File content does not match declared type',
                            });
                            return;
                        }
                    } catch {
                        logger.warn(`🚨 File upload: Invalid base64 data from ${req.ip}`);
                        res.status(400).json({
                            success: false,
                            error: 'Invalid file data',
                        });
                        return;
                    }
                }
            }
        }

        // Sanitize filename if present
        if (req.body?.filename) {
            req.body.filename = sanitizeFilename(req.body.filename);

            if (!isValidFileExtension(req.body.filename)) {
                logger.warn(`🚨 File upload: Dangerous extension in ${req.body.filename} from ${req.ip}`);
                res.status(400).json({
                    success: false,
                    error: 'File extension not allowed',
                });
                return;
            }
        }

        next();
    };
}

// ==========================================
// SSRF PROTECTION
// ==========================================

// Private IP ranges
const PRIVATE_IP_PATTERNS = [
    /^127\./,                                    // Loopback
    /^10\./,                                     // Class A private
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,           // Class B private
    /^192\.168\./,                               // Class C private
    /^169\.254\./,                               // Link-local
    /^0\./,                                      // Current network
    /^localhost$/i,
    /^::1$/,                                     // IPv6 loopback
    /^fc00:/i,                                   // IPv6 private
    /^fe80:/i,                                   // IPv6 link-local
];

// Dangerous schemes
const ALLOWED_SCHEMES = ['http:', 'https:'];

/**
 * Check if URL is safe (not internal/private)
 */
export function isUrlSafe(urlString: string): { safe: boolean; reason?: string } {
    try {
        const url = new URL(urlString);

        // Check scheme
        if (!ALLOWED_SCHEMES.includes(url.protocol)) {
            return { safe: false, reason: `Scheme not allowed: ${url.protocol}` };
        }

        // Check for private IPs
        const hostname = url.hostname.toLowerCase();
        for (const pattern of PRIVATE_IP_PATTERNS) {
            if (pattern.test(hostname)) {
                return { safe: false, reason: 'Internal network access not allowed' };
            }
        }

        // Check for localhost variants
        if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
            return { safe: false, reason: 'Localhost access not allowed' };
        }

        // Check for IP address in octets that could be private
        const ipMatch = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
        if (ipMatch) {
            const octets = ipMatch.slice(1).map(Number);
            // Additional checks for various private ranges
            if (octets[0] === 0 || octets[0] === 127 || octets[0] === 10) {
                return { safe: false, reason: 'Private IP access not allowed' };
            }
        }

        return { safe: true };
    } catch {
        return { safe: false, reason: 'Invalid URL format' };
    }
}

/**
 * SSRF protection middleware
 */
export function ssrfProtection(urlField: string = 'url') {
    return (req: Request, res: Response, next: NextFunction): void => {
        const url = req.body?.[urlField] || req.query?.[urlField];

        if (url && typeof url === 'string') {
            const check = isUrlSafe(url);
            if (!check.safe) {
                logger.warn(`🚨 SSRF: Blocked request to ${url} (${check.reason}) from ${req.ip}`);
                res.status(400).json({
                    success: false,
                    error: check.reason || 'URL not allowed',
                });
                return;
            }
        }

        next();
    };
}

// ==========================================
// HOST HEADER INJECTION PROTECTION
// ==========================================

// Allowed hosts (add your domains)
const ALLOWED_HOSTS: string[] = [
    'localhost',
    '127.0.0.1',
    '::1',
    'api.lvenc.site',
    'lvenc.site',
];

/**
 * Host header validation middleware
 */
export function hostHeaderProtection(allowedHosts: string[] = ALLOWED_HOSTS) {
    return (req: Request, res: Response, next: NextFunction): void => {
        const host = req.headers.host?.split(':')[0]; // Remove port

        if (!host) {
            res.status(400).json({
                success: false,
                error: 'Host header required',
            });
            return;
        }

        // In development, allow any localhost
        if (process.env.NODE_ENV === 'development') {
            if (host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.')) {
                next();
                return;
            }
        }

        if (!allowedHosts.includes(host)) {
            logger.warn(`🚨 Host header injection: Invalid host ${host} from ${req.ip}`);
            res.status(400).json({
                success: false,
                error: 'Invalid host',
            });
            return;
        }

        next();
    };
}

// ==========================================
// OPEN REDIRECT PROTECTION
// ==========================================

/**
 * Validate redirect URL to prevent open redirects
 */
export function isRedirectSafe(redirectUrl: string, allowedDomains: string[]): boolean {
    // Allow relative URLs
    if (redirectUrl.startsWith('/') && !redirectUrl.startsWith('//')) {
        return true;
    }

    try {
        const url = new URL(redirectUrl);
        return allowedDomains.some(domain =>
            url.hostname === domain || url.hostname.endsWith('.' + domain)
        );
    } catch {
        return false;
    }
}

/**
 * Open redirect protection middleware
 */
export function openRedirectProtection(redirectField: string = 'redirect', allowedDomains: string[] = ALLOWED_HOSTS) {
    return (req: Request, res: Response, next: NextFunction): void => {
        const redirect = req.query?.[redirectField] || req.body?.[redirectField];

        if (redirect && typeof redirect === 'string') {
            if (!isRedirectSafe(redirect, allowedDomains)) {
                logger.warn(`🚨 Open redirect: Blocked redirect to ${redirect} from ${req.ip}`);
                res.status(400).json({
                    success: false,
                    error: 'Invalid redirect URL',
                });
                return;
            }
        }

        next();
    };
}

// ==========================================
// DoS PROTECTION
// ==========================================

// ReDoS-safe patterns (avoid catastrophic backtracking)
const REDOS_DANGEROUS_PATTERNS = [
    /([a-z]+)+$/,           // Nested quantifiers
    /(a*)*$/,               // Exponential backtracking
    /(a|a?)+$/,             // Alternation with overlap
];

/**
 * Check string for potential ReDoS attack
 */
export function isReDoSSafe(input: string, maxLength: number = 10000): boolean {
    // Limit input length
    if (input.length > maxLength) {
        return false;
    }

    // Check for patterns that could cause catastrophic backtracking
    // in regex operations elsewhere in the system
    if (/(.)\1{100,}/.test(input)) {
        return false; // 100+ repeated chars
    }

    return true;
}

/**
 * Request size limiter for DoS protection
 */
export function requestSizeLimiter(maxBodySize: number = 5 * 1024 * 1024) {
    return (req: Request, res: Response, next: NextFunction): void => {
        const contentLength = parseInt(req.headers['content-length'] || '0', 10);

        if (contentLength > maxBodySize) {
            logger.warn(`🚨 DoS: Request too large (${contentLength} bytes) from ${req.ip}`);
            res.status(413).json({
                success: false,
                error: `Request too large. Maximum size: ${maxBodySize / 1024 / 1024}MB`,
            });
            return;
        }

        next();
    };
}

/**
 * JSON depth limiter to prevent deeply nested payloads
 */
export function jsonDepthLimiter(maxDepth: number = 10) {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (req.body && typeof req.body === 'object') {
            const depth = getObjectDepth(req.body);
            if (depth > maxDepth) {
                logger.warn(`🚨 DoS: JSON too deep (${depth} levels) from ${req.ip}`);
                res.status(400).json({
                    success: false,
                    error: `Request JSON too deeply nested. Maximum depth: ${maxDepth}`,
                });
                return;
            }
        }
        next();
    };
}

function getObjectDepth(obj: unknown, currentDepth: number = 0): number {
    if (currentDepth > 100) return currentDepth; // Safety limit

    if (obj === null || typeof obj !== 'object') {
        return currentDepth;
    }

    let maxChildDepth = currentDepth;

    if (Array.isArray(obj)) {
        for (const item of obj) {
            maxChildDepth = Math.max(maxChildDepth, getObjectDepth(item, currentDepth + 1));
        }
    } else {
        for (const value of Object.values(obj)) {
            maxChildDepth = Math.max(maxChildDepth, getObjectDepth(value, currentDepth + 1));
        }
    }

    return maxChildDepth;
}

/**
 * Connection timeout middleware for Slowloris protection
 * Note: This should be configured at nginx/load balancer level ideally
 */
export function connectionTimeout(timeoutMs: number = 30000) {
    return (req: Request, res: Response, next: NextFunction): void => {
        req.setTimeout(timeoutMs, () => {
            logger.warn(`🚨 Slowloris: Request timeout from ${req.ip}`);
            res.status(408).json({
                success: false,
                error: 'Request timeout',
            });
        });
        next();
    };
}
