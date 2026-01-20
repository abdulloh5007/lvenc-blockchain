import { Request, Response, NextFunction } from 'express';
import { logger } from '../../../protocol/utils/logger.js';

/**
 * API Key Authentication Middleware
 * Protects admin routes with X-API-Key header
 */
export const apiKeyAuth = (req: Request, res: Response, next: NextFunction): void => {
    const apiKey = req.headers['x-api-key'] as string;
    const validKey = process.env.ADMIN_API_KEY;

    if (!validKey) {
        logger.warn('⚠️ ADMIN_API_KEY not configured in environment');
        res.status(500).json({
            success: false,
            error: 'API key authentication not configured',
        });
        return;
    }

    if (!apiKey) {
        res.status(401).json({
            success: false,
            error: 'API key required. Add X-API-Key header.',
        });
        return;
    }

    if (apiKey !== validKey) {
        logger.warn(`🔒 Invalid API key attempt from ${req.ip}`);
        res.status(403).json({
            success: false,
            error: 'Invalid API key',
        });
        return;
    }

    next();
};

/**
 * Optional API Key - logs if present but doesn't require it
 */
export const optionalApiKey = (req: Request, _res: Response, next: NextFunction): void => {
    const apiKey = req.headers['x-api-key'] as string;
    if (apiKey) {
        (req as any).hasApiKey = true;
    }
    next();
};

/**
 * Signature verification for signed endpoints
 * Checks that the transaction/action is properly signed
 */
export const requireSignature = (req: Request, res: Response, next: NextFunction): void => {
    const { signature, publicKey } = req.body;

    if (!signature) {
        res.status(400).json({
            success: false,
            error: 'Signature required for this operation',
        });
        return;
    }

    // Signature will be verified in the actual route handler
    // This middleware just ensures the field exists
    next();
};
