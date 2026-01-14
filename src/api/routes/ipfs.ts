import { Router, Request, Response } from 'express';
import lighthouse from '@lighthouse-web3/sdk';
import { logger } from '../../utils/logger.js';

// Lighthouse configuration
const LIGHTHOUSE_API_KEY = process.env.LIGHTHOUSE_API_KEY || '';
const LIGHTHOUSE_GATEWAY = 'https://gateway.lighthouse.storage/ipfs';

// Fallback to custom gateway if configured
const IPFS_GATEWAY_URL = process.env.IPFS_GATEWAY_URL || LIGHTHOUSE_GATEWAY;

export function createIPFSRoutes(): Router {
    const router = Router();

    // Health check for Lighthouse
    router.get('/status', async (_req: Request, res: Response) => {
        if (!LIGHTHOUSE_API_KEY) {
            res.json({
                success: true,
                data: {
                    connected: false,
                    provider: 'lighthouse',
                    message: 'LIGHTHOUSE_API_KEY not configured',
                },
            });
            return;
        }

        try {
            // Get API key info
            const balance = await lighthouse.getBalance(LIGHTHOUSE_API_KEY);
            res.json({
                success: true,
                data: {
                    connected: true,
                    provider: 'lighthouse',
                    network: 'filecoin',
                    balance: balance.data,
                    gatewayUrl: IPFS_GATEWAY_URL,
                },
            });
        } catch (error) {
            res.json({
                success: true,
                data: {
                    connected: true,
                    provider: 'lighthouse',
                    gatewayUrl: IPFS_GATEWAY_URL,
                },
            });
        }
    });

    // Upload file to Lighthouse (Filecoin)
    router.post('/upload', async (req: Request, res: Response) => {
        const { data, filename } = req.body;

        if (!data) {
            res.status(400).json({ success: false, error: 'No data provided' });
            return;
        }

        if (!LIGHTHOUSE_API_KEY) {
            res.status(503).json({
                success: false,
                error: 'Lighthouse API key not configured. Set LIGHTHOUSE_API_KEY in .env',
            });
            return;
        }

        try {
            // Handle base64 data
            let buffer: Buffer;
            let mimeType = 'application/octet-stream';

            if (data.startsWith('data:')) {
                // Extract mime type and base64 from data URL
                const matches = data.match(/^data:([^;]+);base64,(.+)$/);
                if (matches) {
                    mimeType = matches[1];
                    buffer = Buffer.from(matches[2], 'base64');
                } else {
                    buffer = Buffer.from(data.split(',')[1], 'base64');
                }
            } else {
                buffer = Buffer.from(data, 'base64');
            }

            // Upload to Lighthouse
            const response = await lighthouse.uploadBuffer(
                buffer,
                LIGHTHOUSE_API_KEY,
                filename || 'file'
            );

            if (!response.data || !response.data.Hash) {
                throw new Error('Upload failed - no hash returned');
            }

            const cid = response.data.Hash;
            const ipfsUrl = `ipfs://${cid}`;
            const gatewayUrl = `${IPFS_GATEWAY_URL}/${cid}`;

            logger.info(`📤 Uploaded to Lighthouse/Filecoin: ${cid} (${buffer.length} bytes)`);

            res.json({
                success: true,
                data: {
                    cid,
                    ipfsUrl,
                    gatewayUrl,
                    size: buffer.length,
                    provider: 'lighthouse',
                    network: 'filecoin',
                },
            });
        } catch (error) {
            logger.error('Lighthouse upload error:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Upload failed',
            });
        }
    });

    // Get file from IPFS via Lighthouse gateway (redirect)
    router.get('/file/:cid', async (req: Request, res: Response) => {
        const { cid } = req.params;

        // Redirect to Lighthouse gateway
        const gatewayUrl = `${IPFS_GATEWAY_URL}/${cid}`;
        res.redirect(gatewayUrl);
    });

    // Get uploads list
    router.get('/uploads', async (_req: Request, res: Response) => {
        if (!LIGHTHOUSE_API_KEY) {
            res.status(503).json({ success: false, error: 'Lighthouse not configured' });
            return;
        }

        try {
            const uploads = await lighthouse.getUploads(LIGHTHOUSE_API_KEY);
            res.json({
                success: true,
                data: {
                    uploads: uploads.data?.fileList || [],
                    count: uploads.data?.fileList?.length || 0,
                },
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to get uploads',
            });
        }
    });

    // Get deal status for a CID
    router.get('/deal/:cid', async (req: Request, res: Response) => {
        const { cid } = req.params;

        try {
            const status = await lighthouse.dealStatus(cid);
            res.json({
                success: true,
                data: status.data,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to get deal status',
            });
        }
    });

    return router;
}
