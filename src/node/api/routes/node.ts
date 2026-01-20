/**
 * Node Status Routes
 * Read-only endpoints for node operators to inspect node status
 */

import { Router, Request, Response } from 'express';
import { Blockchain } from '../../../protocol/blockchain/index.js';
import { P2PServer } from '../../../network/index.js';
import { getNodeIdentity } from '../../identity/index.js';
import { config } from '../../config.js';
import { NodeVersionStatus } from '../../../network/types.js';

export function createNodeRoutes(blockchain: Blockchain, p2pServer: P2PServer): Router {
    const router = Router();

    /**
     * GET /node/status
     * Comprehensive node status for operators
     */
    router.get('/status', (_req: Request, res: Response) => {
        const identity = getNodeIdentity();
        const currentBlockHeight = blockchain.chain.length - 1;
        const graceUntilBlock = config.version.graceUntilBlock;

        // Calculate version status
        let versionStatus: NodeVersionStatus = NodeVersionStatus.UP_TO_DATE;
        let graceBlocksRemaining: number | null = null;

        if (graceUntilBlock) {
            graceBlocksRemaining = Math.max(0, graceUntilBlock - currentBlockHeight);
            if (currentBlockHeight >= graceUntilBlock) {
                versionStatus = NodeVersionStatus.OUTDATED_GRACE_EXPIRED;
            } else {
                versionStatus = NodeVersionStatus.OUTDATED_WITHIN_GRACE;
            }
        }

        // Collect any warnings
        const warnings: string[] = [];

        if (graceBlocksRemaining !== null && graceBlocksRemaining <= 100) {
            warnings.push(`URGENT: Only ${graceBlocksRemaining} blocks until grace expires!`);
        } else if (graceBlocksRemaining !== null && graceBlocksRemaining <= 1000) {
            warnings.push(`Protocol upgrade required soon. ${graceBlocksRemaining} blocks remaining.`);
        }

        if (!identity?.getRewardAddress()) {
            warnings.push('No reward address configured. Run POST /api/v1/network/identity/reward');
        }

        res.json({
            success: true,
            data: {
                identity: {
                    nodeId: identity?.getNodeId() || null,
                    shortId: identity?.getShortId() || null,
                    rewardAddress: identity?.getRewardAddress() || null,
                    createdAt: identity?.getCreatedAt() || null,
                },
                version: {
                    nodeVersion: config.version.nodeVersion,
                    protocolVersion: config.version.protocolVersion,
                    minProtocolVersion: config.version.minProtocolVersion,
                    status: versionStatus,
                    graceUntilBlock,
                    graceBlocksRemaining,
                },
                network: {
                    chainId: config.isTestnet ? 'testnet' : 'mainnet',
                    peers: p2pServer.getPeerCount(),
                    knownPeers: p2pServer.getKnownPeers().length,
                    blockHeight: currentBlockHeight,
                },
                warnings,
            },
        });
    });

    /**
     * GET /node/version
     * Quick version check
     */
    router.get('/version', (_req: Request, res: Response) => {
        res.json({
            success: true,
            data: {
                nodeVersion: config.version.nodeVersion,
                protocolVersion: config.version.protocolVersion,
            },
        });
    });

    /**
     * GET /node/health
     * Simple health check for monitoring
     */
    router.get('/health', (_req: Request, res: Response) => {
        const currentBlockHeight = blockchain.chain.length - 1;
        const peers = p2pServer.getPeerCount();

        const healthy = peers > 0 || currentBlockHeight > 0;

        res.status(healthy ? 200 : 503).json({
            status: healthy ? 'healthy' : 'unhealthy',
            blockHeight: currentBlockHeight,
            peers,
            timestamp: Date.now(),
        });
    });

    return router;
}
