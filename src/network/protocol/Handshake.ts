/**
 * Handshake Handler
 * Manages protocol version control, block-based grace periods, and handshake verification
 */

import { HandshakeData, VersionRejectData, VersionErrorCode, NodeVersionStatus } from '../types.js';
import { config } from '../../node/config.js';
import { logger } from '../../protocol/utils/logger.js';
import { getNodeIdentity } from '../../node/identity/index.js';

export interface HandshakeResult {
    verified: boolean;
    error?: VersionErrorCode;
    status?: NodeVersionStatus;
    peerNodeId?: string;  // Peer's cryptographic identity
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
        const identity = getNodeIdentity();

        return {
            nodeId: identity?.getNodeId() || '',
            protocolVersion: config.version.protocolVersion,
            minProtocolVersion: config.version.minProtocolVersion,
            graceUntilBlock: config.version.graceUntilBlock,
            chainId: this.chainId,
            genesisHash: this.genesisHash,
            nodeVersion: config.version.nodeVersion,
            blockHeight,
            rewardAddress: identity?.getRewardAddress() || null,
        };
    }

    // ==================== VERIFY HANDSHAKE ====================

    verifyHandshake(
        data: HandshakeData,
        peerIP: string,
        currentBlockHeight: number,
        sendVersionReject: (data: VersionRejectData) => void
    ): HandshakeResult {
        const ourMinVersion = config.version.minProtocolVersion;
        const peerVersion = data.protocolVersion || 0;

        // Check if peer's protocol version is acceptable
        if (peerVersion < ourMinVersion) {
            const graceUntilBlock = config.version.graceUntilBlock;

            if (graceUntilBlock && currentBlockHeight < graceUntilBlock) {
                // Within grace period - warn but allow
                logger.warn(
                    `⚠️ OUTDATED_WITHIN_GRACE: Peer ${peerIP} using protocol v${peerVersion}. ` +
                    `Upgrade before block #${graceUntilBlock} (current: #${currentBlockHeight})`
                );
                return {
                    verified: true,
                    status: NodeVersionStatus.OUTDATED_WITHIN_GRACE
                };
            } else {
                // Grace expired - hard reject
                const errorCode = graceUntilBlock
                    ? VersionErrorCode.ERR_GRACE_EXPIRED
                    : VersionErrorCode.ERR_MIN_PROTOCOL;

                logger.error(`🚫 ${errorCode}: Peer ${peerIP} protocol v${peerVersion} < required v${ourMinVersion}`);
                sendVersionReject({
                    errorCode,
                    currentVersion: peerVersion,
                    requiredVersion: ourMinVersion,
                    graceUntilBlock,
                    recommendedAction: './update_node.sh',
                });
                return { verified: false, error: errorCode };
            }
        }

        // Check if WE are outdated according to peer
        if (data.minProtocolVersion && config.version.protocolVersion < data.minProtocolVersion) {
            const graceBlock = data.graceUntilBlock;
            if (graceBlock && currentBlockHeight < graceBlock) {
                logger.warn(`⚠️ OUR NODE IS OUTDATED! Upgrade before block #${graceBlock}`);
            } else {
                logger.error(`🚫 OUR NODE IS OUTDATED! Network requires v${data.minProtocolVersion}`);
                logger.error(`📢 Run: ./update_node.sh to update`);
            }
        }

        // Verify chain ID
        if (data.chainId !== this.chainId) {
            logger.warn(`🚫 Wrong chain: ${data.chainId} (expected ${this.chainId})`);
            return { verified: false, error: VersionErrorCode.ERR_MALFORMED_PROTOCOL };
        }

        // Verify genesis hash
        if (data.genesisHash !== this.genesisHash) {
            logger.warn(`🚫 Wrong genesis: ${data.genesisHash}`);
            return { verified: false, error: VersionErrorCode.ERR_GENESIS_MISMATCH };
        }

        return { verified: true, status: NodeVersionStatus.UP_TO_DATE };
    }

    // ==================== HANDLE VERSION REJECT ====================

    handleVersionReject(data: VersionRejectData): void {
        logger.error('');
        logger.error('╔═══════════════════════════════════════════════════════════╗');
        logger.error('║                    UPDATE REQUIRED                        ║');
        logger.error('╠═══════════════════════════════════════════════════════════╣');
        logger.error(`║  Error: ${data.errorCode.padEnd(44)}   ║`);
        logger.error(`║  Your version: v${data.currentVersion}                                        ║`);
        logger.error(`║  Required: v${data.requiredVersion}                                           ║`);
        if (data.graceUntilBlock) {
            logger.error(`║  Grace until block: #${data.graceUntilBlock}                              ║`);
        }
        logger.error('╠═══════════════════════════════════════════════════════════╣');
        logger.error(`║  Run: ${data.recommendedAction.padEnd(50)}   ║`);
        logger.error('╚═══════════════════════════════════════════════════════════╝');
        logger.error('');
    }

    // ==================== GET VERSION STATUS ====================

    getVersionStatus(currentBlockHeight: number): NodeVersionStatus {
        const graceUntilBlock = config.version.graceUntilBlock;

        if (!graceUntilBlock) {
            return NodeVersionStatus.UP_TO_DATE;
        }

        if (currentBlockHeight < graceUntilBlock) {
            return NodeVersionStatus.OUTDATED_WITHIN_GRACE;
        }

        return NodeVersionStatus.OUTDATED_GRACE_EXPIRED;
    }

    // ==================== GRACE WARNING ESCALATION ====================

    /**
     * Check and log grace period warnings with escalating severity
     * Call this periodically (e.g., on each new block or peer maintenance)
     */
    checkGraceWarning(currentBlockHeight: number): void {
        const graceUntilBlock = config.version.graceUntilBlock;
        if (!graceUntilBlock) return;

        const remaining = graceUntilBlock - currentBlockHeight;
        if (remaining <= 0) return; // Already expired, handled elsewhere

        // Escalating warnings based on remaining blocks
        if (remaining <= 100) {
            logger.error(`🚨 URGENT: Only ${remaining} blocks until grace expires! Run ./update_node.sh NOW!`);
        } else if (remaining <= 1000) {
            logger.warn(`⚠️ Protocol upgrade required soon. ${remaining} blocks remaining.`);
        } else if (remaining <= 5000) {
            logger.info(`📢 Protocol upgrade recommended. ${remaining} blocks until grace expires.`);
        }
    }

    /**
     * Get remaining blocks until grace expires
     */
    getRemainingGraceBlocks(currentBlockHeight: number): number | null {
        const graceUntilBlock = config.version.graceUntilBlock;
        if (!graceUntilBlock) return null;
        return Math.max(0, graceUntilBlock - currentBlockHeight);
    }

    // ==================== STARTUP SAFETY CHECK ====================

    /**
     * Check if node should be allowed to start
     * Returns false if grace period has expired (hard reject scenario)
     */
    static checkStartupSafety(currentBlockHeight: number): boolean {
        const graceUntilBlock = config.version.graceUntilBlock;
        const minProtocol = config.version.minProtocolVersion;
        const ourProtocol = config.version.protocolVersion;

        // If we're below min protocol and grace has expired, abort
        if (minProtocol > ourProtocol && graceUntilBlock && currentBlockHeight >= graceUntilBlock) {
            logger.error('');
            logger.error('╔═══════════════════════════════════════════════════════════╗');
            logger.error('║           ❌ NODE STARTUP BLOCKED                          ║');
            logger.error('╠═══════════════════════════════════════════════════════════╣');
            logger.error(`║  Your protocol: v${ourProtocol}                                         ║`);
            logger.error(`║  Required: v${minProtocol}                                              ║`);
            logger.error(`║  Grace expired at block: #${graceUntilBlock}                            ║`);
            logger.error('╠═══════════════════════════════════════════════════════════╣');
            logger.error('║  Run: ./update_node.sh                                    ║');
            logger.error('║  Then restart the node                                    ║');
            logger.error('╚═══════════════════════════════════════════════════════════╝');
            logger.error('');
            return false;
        }

        return true;
    }
}

