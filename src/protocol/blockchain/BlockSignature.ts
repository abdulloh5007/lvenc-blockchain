/**
 * Block Signature Utilities
 * 
 * Domain separation and signature verification for PoS blocks.
 * Uses Ed25519 signatures from node identity keys.
 */

import * as crypto from 'crypto';
import { chainParams } from '../params/index.js';

/**
 * Create signing data with domain separation.
 * Format: {chainId}:{blockIndex}:{blockHash}
 * 
 * This prevents:
 * - Cross-chain replay attacks (chainId)
 * - Height confusion attacks (blockIndex)
 */
export function createSigningData(blockIndex: number, blockHash: string): string {
    return `${chainParams.chainId}:${blockIndex}:${blockHash}`;
}

/**
 * Verify an Ed25519 block signature.
 * 
 * @param signature - Hex-encoded signature
 * @param blockIndex - Block height
 * @param blockHash - Block hash
 * @param validatorNodeId - Hex-encoded public key of validator
 * @returns true if signature is valid
 */
export function verifyBlockSignature(
    signature: string,
    blockIndex: number,
    blockHash: string,
    validatorNodeId: string
): boolean {
    try {
        const signingData = createSigningData(blockIndex, blockHash);
        const publicKey = crypto.createPublicKey({
            key: Buffer.from(validatorNodeId, 'hex'),
            format: 'der',
            type: 'spki'
        });

        return crypto.verify(
            null,
            Buffer.from(signingData),
            publicKey,
            Buffer.from(signature, 'hex')
        );
    } catch (error) {
        // Invalid key format or signature
        return false;
    }
}
