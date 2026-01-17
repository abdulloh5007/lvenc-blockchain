import { Router, Request, Response } from 'express';
import { P2PServer } from '../../network/index.js';
import { getNodeIdentity } from '../../identity/index.js';

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

    // ==================== NODE IDENTITY ====================

    // Get node identity (public info only)
    router.get('/identity', (_req: Request, res: Response) => {
        const identity = getNodeIdentity();

        if (!identity) {
            res.status(503).json({
                success: false,
                error: 'Node identity not initialized',
            });
            return;
        }

        res.json({
            success: true,
            data: identity.toPublicJSON(),
        });
    });

    // Bind reward address
    router.post('/identity/reward', async (req: Request, res: Response) => {
        const { rewardAddress } = req.body;
        const identity = getNodeIdentity();

        if (!identity) {
            res.status(503).json({
                success: false,
                error: 'Node identity not initialized',
            });
            return;
        }

        if (!rewardAddress || typeof rewardAddress !== 'string') {
            res.status(400).json({
                success: false,
                error: 'rewardAddress is required',
            });
            return;
        }

        try {
            await identity.bindRewardAddress(rewardAddress);
            res.json({
                success: true,
                data: {
                    message: 'Reward address bound successfully',
                    rewardAddress,
                    nodeId: identity.getNodeId(),
                },
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: `Failed to bind reward address: ${error instanceof Error ? error.message : 'Unknown error'}`,
            });
        }
    });

    return router;
}

