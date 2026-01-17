/**
 * Handshake Handler
 * Manages protocol version control, grace periods, and handshake verification
 */

import WebSocket from 'ws';
import { HandshakeData, MessageType, VersionRejectData } from '../types.js';
import { config } from '../../config.js';
import { logger } from '../../utils/logger.js';

export interface HandshakeResult {
    verified: boolean;
    error?: string;
}

export class HandshakeHandler {
    private chainId: string;
    private genesisHash: string;

    constructor(chainId: string, genesisHash: string) {
        this.chainId = chainId;
        this.genesisHash = genesisHash;
    }

    // ==================== CREATE HANDSHAKE ====================

    createHandshakeData(blockHeight: number): HandshakeData {
        return {
            protocolVersion: config.version.protocolVersion,
            minProtocolVersion: config.version.minProtocolVersion,
            graceDeadline: config.version.graceDeadline,
            chainId: this.chainId,
            genesisHash: this.genesisHash,
            nodeVersion: config.version.nodeVersion,
            blockHeight,
        };
    }

    // ==================== VERIFY HANDSHAKE ====================

    verifyHandshake(
        data: HandshakeData,
        peerIP: string,
        sendVersionReject: (data: VersionRejectData) => void
    ): HandshakeResult {
        // VERSION CONTROL: Check if peer's protocol version is acceptable
        const ourMinVersion = config.version.minProtocolVersion;
        const peerVersion = data.protocolVersion || 0;

        if (peerVersion < ourMinVersion) {
            const now = Date.now();
            const graceDeadline = config.version.graceDeadline;

            if (graceDeadline && now < graceDeadline) {
                // Grace period - warn but allow
                logger.warn(
                    `⚠️ CRITICAL UPDATE REQUIRED: Peer ${peerIP} using old protocol v${peerVersion}. ` +
                    `Upgrade before ${new Date(graceDeadline).toISOString()}`
                );
            } else {
                // Hard reject
                logger.error(`🚫 VERSION REJECTED: Peer ${peerIP} protocol v${peerVersion} < required v${ourMinVersion}`);
                sendVersionReject({
                    reason: 'UPDATE_REQUIRED',
                    minVersion: ourMinVersion,
                    yourVersion: peerVersion,
                    updateCommand: 'git pull && npm run build',
                });
                return { verified: false, error: 'outdated_version' };
            }
        }

        // Check if WE are outdated
        if (data.minProtocolVersion && config.version.protocolVersion < data.minProtocolVersion) {
            logger.error(`🚫 OUR NODE IS OUTDATED! Network requires v${data.minProtocolVersion}, we have v${config.version.protocolVersion}`);
            logger.error(`📢 Run: ./update_node.sh to update`);
        }

        // Verify chain ID
        if (data.chainId !== this.chainId) {
            logger.warn(`🚫 Wrong chain: ${data.chainId} (expected ${this.chainId})`);
            return { verified: false, error: 'wrong_chain' };
        }

        // Verify genesis hash
        if (data.genesisHash !== this.genesisHash) {
            logger.warn(`🚫 Wrong genesis: ${data.genesisHash}`);
            return { verified: false, error: 'wrong_genesis' };
        }

        return { verified: true };
    }

    // ==================== HANDLE VERSION REJECT ====================

    handleVersionReject(data: VersionRejectData): void {
        logger.error('');
        logger.error('╔═══════════════════════════════════════════════════╗');
        logger.error('║              UPDATE REQUIRED                      ║');
        logger.error('╠═══════════════════════════════════════════════════╣');
        logger.error(`║  Your version: v${data.yourVersion}                              ║`);
        logger.error(`║  Required: v${data.minVersion}                                   ║`);
        logger.error('╠═══════════════════════════════════════════════════╣');
        logger.error('║  Run: ./update_node.sh                            ║');
        logger.error('║  Or:  git pull && npm run build                   ║');
        logger.error('╚═══════════════════════════════════════════════════╝');
        logger.error('');
    }
}
