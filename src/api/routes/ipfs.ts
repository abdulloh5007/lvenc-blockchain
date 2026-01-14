import { Router, Request, Response } from 'express';
import { create } from 'ipfs-http-client';
import { logger } from '../../utils/logger.js';

// IPFS client - connects to local IPFS daemon
const IPFS_API_URL = process.env.IPFS_API_URL || 'http://127.0.0.1:5001';
const IPFS_GATEWAY_URL = process.env.IPFS_GATEWAY_URL || 'http://127.0.0.1:8080';

let ipfs: ReturnType<typeof create> | null = null;

// Try to connect to IPFS
try {
    ipfs = create({ url: IPFS_API_URL });
    logger.info(`🌐 IPFS client configured for ${IPFS_API_URL}`);
} catch (error) {
    logger.warn('⚠️ IPFS daemon not available. File uploads will use base64 fallback.');
}

export function createIPFSRoutes(): Router {
    const router = Router();

    // Health check for IPFS
    router.get('/status', async (_req: Request, res: Response) => {
        if (!ipfs) {
            res.json({ success: true, data: { connected: false, message: 'IPFS not configured' } });
            return;
        }

        try {
            const id = await ipfs.id();
            res.json({
                success: true,
                data: {
                    connected: true,
                    peerId: id.id.toString(),
                    agentVersion: id.agentVersion,
                    gatewayUrl: IPFS_GATEWAY_URL,
                },
            });
        } catch (error) {
            res.json({
                success: true,
                data: { connected: false, message: 'IPFS daemon not running' },
            });
        }
    });

    // Upload file to IPFS
    router.post('/upload', async (req: Request, res: Response) => {
        const { data, filename } = req.body;

        if (!data) {
            res.status(400).json({ success: false, error: 'No data provided' });
            return;
        }

        // If IPFS is not available, return with info
        if (!ipfs) {
            res.status(503).json({
                success: false,
                error: 'IPFS daemon not available. Please start IPFS or use base64 images.',
            });
            return;
        }

        try {
            // Handle base64 data
            let buffer: Buffer;
            if (data.startsWith('data:')) {
                // Extract base64 from data URL
                const base64Data = data.split(',')[1];
                buffer = Buffer.from(base64Data, 'base64');
            } else {
                buffer = Buffer.from(data, 'base64');
            }

            // Add to IPFS
            const result = await ipfs.add(buffer, {
                pin: true, // Pin immediately
            });

            const cid = result.cid.toString();
            const ipfsUrl = `ipfs://${cid}`;
            const gatewayUrl = `${IPFS_GATEWAY_URL}/ipfs/${cid}`;

            logger.info(`📤 Uploaded to IPFS: ${cid} (${buffer.length} bytes)`);

            res.json({
                success: true,
                data: {
                    cid,
                    ipfsUrl,
                    gatewayUrl,
                    size: buffer.length,
                },
            });
        } catch (error) {
            logger.error('IPFS upload error:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Upload failed',
            });
        }
    });

    // Get file from IPFS (proxy)
    router.get('/file/:cid', async (req: Request, res: Response) => {
        const { cid } = req.params;

        if (!ipfs) {
            res.status(503).json({ success: false, error: 'IPFS not available' });
            return;
        }

        try {
            const chunks: Uint8Array[] = [];
            for await (const chunk of ipfs.cat(cid)) {
                chunks.push(chunk);
            }
            const data = Buffer.concat(chunks);

            // Try to detect content type
            const isImage = data[0] === 0xFF || data[0] === 0x89 || data[0] === 0x47;
            res.setHeader('Content-Type', isImage ? 'image/png' : 'application/octet-stream');
            res.send(data);
        } catch (error) {
            res.status(404).json({ success: false, error: 'File not found' });
        }
    });

    // Pin a CID
    router.post('/pin/:cid', async (req: Request, res: Response) => {
        const { cid } = req.params;

        if (!ipfs) {
            res.status(503).json({ success: false, error: 'IPFS not available' });
            return;
        }

        try {
            await ipfs.pin.add(cid);
            logger.info(`📌 Pinned: ${cid}`);
            res.json({ success: true, data: { cid, pinned: true } });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Pin failed',
            });
        }
    });

    // List pinned files
    router.get('/pins', async (_req: Request, res: Response) => {
        if (!ipfs) {
            res.status(503).json({ success: false, error: 'IPFS not available' });
            return;
        }

        try {
            const pins: string[] = [];
            for await (const pin of ipfs.pin.ls()) {
                pins.push(pin.cid.toString());
            }
            res.json({ success: true, data: { pins, count: pins.length } });
        } catch (error) {
            res.status(500).json({ success: false, error: 'Failed to list pins' });
        }
    });

    return router;
}
