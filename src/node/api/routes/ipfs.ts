import { Router, Request, Response } from 'express';
import { logger } from '../../../protocol/utils/logger.js';

// Pinata configuration
const PINATA_JWT = process.env.PINATA_JWT || '';
const PINATA_GATEWAY = process.env.PINATA_GATEWAY || 'https://gateway.pinata.cloud/ipfs';

export function createIPFSRoutes(): Router {
    const router = Router();

    // Health check for Pinata
    router.get('/status', async (_req: Request, res: Response) => {
        if (!PINATA_JWT) {
            res.json({
                success: true,
                data: {
                    connected: false,
                    provider: 'pinata',
                    message: 'PINATA_JWT not configured',
                },
            });
            return;
        }

        try {
            // Test authentication with Pinata
            const response = await fetch('https://api.pinata.cloud/data/testAuthentication', {
                headers: {
                    'Authorization': `Bearer ${PINATA_JWT}`,
                },
            });

            if (response.ok) {
                const data = await response.json() as { message?: string };
                res.json({
                    success: true,
                    data: {
                        connected: true,
                        provider: 'pinata',
                        message: data.message || 'Authenticated',
                        gatewayUrl: PINATA_GATEWAY,
                    },
                });
            } else {
                res.json({
                    success: true,
                    data: {
                        connected: false,
                        provider: 'pinata',
                        message: 'Authentication failed',
                    },
                });
            }
        } catch (error) {
            res.json({
                success: true,
                data: {
                    connected: false,
                    provider: 'pinata',
                    error: error instanceof Error ? error.message : 'Connection failed',
                },
            });
        }
    });

    // Upload file to Pinata
    router.post('/upload', async (req: Request, res: Response) => {
        const { data, filename } = req.body;

        if (!data) {
            res.status(400).json({ success: false, error: 'No data provided' });
            return;
        }

        if (!PINATA_JWT) {
            res.status(503).json({
                success: false,
                error: 'Pinata JWT not configured. Set PINATA_JWT in .env',
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

            // Upload to Pinata
            const formData = new FormData();
            const blob = new Blob([buffer], { type: mimeType });
            formData.append('file', blob, filename || 'file');

            // Add metadata
            const metadata = JSON.stringify({
                name: filename || 'file',
            });
            formData.append('pinataMetadata', metadata);

            const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${PINATA_JWT}`,
                },
                body: formData,
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Pinata upload failed: ${errorText}`);
            }

            const result = await response.json() as { IpfsHash?: string; PinSize?: number };
            const cid = result.IpfsHash;

            if (!cid) {
                throw new Error('Upload failed - no hash returned');
            }

            const ipfsUrl = `ipfs://${cid}`;
            const gatewayUrl = `${PINATA_GATEWAY}/${cid}`;

            logger.info(`📤 Uploaded to Pinata: ${cid} (${buffer.length} bytes)`);

            res.json({
                success: true,
                data: {
                    cid,
                    ipfsUrl,
                    gatewayUrl,
                    size: result.PinSize || buffer.length,
                    provider: 'pinata',
                },
            });
        } catch (error) {
            logger.error('Pinata upload error:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Upload failed',
            });
        }
    });

    // Get file from IPFS via Pinata gateway (redirect)
    router.get('/file/:cid', async (req: Request, res: Response) => {
        const { cid } = req.params;
        const gatewayUrl = `${PINATA_GATEWAY}/${cid}`;
        res.redirect(gatewayUrl);
    });

    // Get pinned files list
    router.get('/uploads', async (_req: Request, res: Response) => {
        if (!PINATA_JWT) {
            res.status(503).json({ success: false, error: 'Pinata not configured' });
            return;
        }

        try {
            const response = await fetch('https://api.pinata.cloud/data/pinList?status=pinned&pageLimit=100', {
                headers: {
                    'Authorization': `Bearer ${PINATA_JWT}`,
                },
            });

            if (!response.ok) {
                throw new Error('Failed to fetch pins');
            }

            const data = await response.json() as { rows?: Array<{ ipfs_pin_hash: string; metadata?: { name?: string }; date_pinned?: string }> };

            res.json({
                success: true,
                data: {
                    uploads: data.rows?.map(pin => ({
                        cid: pin.ipfs_pin_hash,
                        name: pin.metadata?.name || 'Unknown',
                        date: pin.date_pinned,
                    })) || [],
                    count: data.rows?.length || 0,
                },
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to get uploads',
            });
        }
    });

    // Unpin a file
    router.delete('/unpin/:cid', async (req: Request, res: Response) => {
        const { cid } = req.params;

        if (!PINATA_JWT) {
            res.status(503).json({ success: false, error: 'Pinata not configured' });
            return;
        }

        try {
            const response = await fetch(`https://api.pinata.cloud/pinning/unpin/${cid}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${PINATA_JWT}`,
                },
            });

            if (!response.ok) {
                throw new Error('Failed to unpin');
            }

            res.json({
                success: true,
                data: { message: `Unpinned ${cid}` },
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to unpin',
            });
        }
    });

    return router;
}
