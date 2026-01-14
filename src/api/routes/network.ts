import { Router, Request, Response } from 'express';
import { P2PServer } from '../../network/index.js';

export function createNetworkRoutes(p2pServer: P2PServer): Router {
    const router = Router();

    // Get peers
    router.get('/peers', (_req: Request, res: Response) => {
        res.json({
            success: true,
            data: {
                peers: p2pServer.getPeers(),
                count: p2pServer.getPeerCount(),
            },
        });
    });

    // Connect to peer
    router.post('/peers/connect', async (req: Request, res: Response) => {
        const { peerUrl } = req.body;

        if (!peerUrl) {
            res.status(400).json({
                success: false,
                error: 'Peer URL is required',
            });
            return;
        }

        try {
            await p2pServer.connectToPeer(peerUrl);
            res.json({
                success: true,
                data: {
                    message: `Connected to ${peerUrl}`,
                    totalPeers: p2pServer.getPeerCount(),
                },
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: `Failed to connect to peer: ${error instanceof Error ? error.message : 'Unknown error'}`,
            });
        }
    });

    return router;
}
