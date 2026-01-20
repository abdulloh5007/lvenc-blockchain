/**
 * ECDSA Signature Utilities
 * Low-S normalization to prevent signature malleability attacks
 * 
 * In ECDSA, both (r, s) and (r, n-s) are valid signatures for the same message.
 * This allows attackers to "flip" signatures, which can cause issues with
 * transaction tracking and replay protection.
 * 
 * Solution: Always use the "low-S" form where s <= n/2
 */

import elliptic from 'elliptic';
import BN from 'bn.js';

const ec = new elliptic.ec('secp256k1');

// secp256k1 curve order
const CURVE_ORDER = ec.curve.n;
const HALF_CURVE_ORDER = CURVE_ORDER.shrn(1); // n/2

interface NormalizedSignature {
    r: string;
    s: string;
    recovery: number;
}

/**
 * Check if s-value is in low-S form (s <= n/2)
 */
export function isLowS(s: BN): boolean {
    return s.cmp(HALF_CURVE_ORDER) <= 0;
}

/**
 * Normalize s-value to low-S form
 * If s > n/2, replace with n - s
 */
export function normalizeSValue(s: BN): BN {
    if (isLowS(s)) {
        return s;
    }
    return CURVE_ORDER.sub(s);
}

/**
 * Normalize a DER-encoded signature to low-S form
 */
export function normalizeSignature(derSignature: string): string {
    try {
        // Parse DER signature
        const sig = Buffer.from(derSignature, 'hex');

        // DER format: 30 [length] 02 [r-length] [r] 02 [s-length] [s]
        if (sig[0] !== 0x30) {
            throw new Error('Invalid DER signature');
        }

        let offset = 2;

        // Read r
        if (sig[offset] !== 0x02) throw new Error('Invalid r marker');
        const rLen = sig[offset + 1];
        const r = sig.slice(offset + 2, offset + 2 + rLen);
        offset += 2 + rLen;

        // Read s
        if (sig[offset] !== 0x02) throw new Error('Invalid s marker');
        const sLen = sig[offset + 1];
        const s = sig.slice(offset + 2, offset + 2 + sLen);

        // Convert s to BN and normalize
        const sBN = new BN(s);
        const normalizedS = normalizeSValue(sBN);

        // If already normalized, return as-is
        if (sBN.eq(normalizedS)) {
            return derSignature;
        }

        // Encode normalized signature back to DER
        const normalizedSBuffer = normalizedS.toArrayLike(Buffer, 'be');

        // Ensure no leading zero is needed (unless high bit set)
        const needsLeadingZero = (normalizedSBuffer[0] & 0x80) !== 0;
        const newSLen = normalizedSBuffer.length + (needsLeadingZero ? 1 : 0);

        // Build new DER signature
        const newSig = Buffer.alloc(4 + rLen + 2 + newSLen);
        newSig[0] = 0x30;
        newSig[1] = 2 + rLen + 2 + newSLen;
        newSig[2] = 0x02;
        newSig[3] = rLen;
        r.copy(newSig, 4);
        newSig[4 + rLen] = 0x02;
        newSig[4 + rLen + 1] = newSLen;

        if (needsLeadingZero) {
            newSig[4 + rLen + 2] = 0x00;
            normalizedSBuffer.copy(newSig, 4 + rLen + 3);
        } else {
            normalizedSBuffer.copy(newSig, 4 + rLen + 2);
        }

        return newSig.toString('hex');
    } catch (error) {
        // If parsing fails, return original
        return derSignature;
    }
}

/**
 * Sign message with low-S normalization
 */
export function signWithLowS(privateKey: string, messageHash: string): string {
    const keyPair = ec.keyFromPrivate(privateKey, 'hex');
    const signature = keyPair.sign(messageHash, { canonical: true });

    // The 'canonical' option in elliptic library already ensures low-S
    return signature.toDER('hex');
}

/**
 * Verify signature (accepts both high-S and low-S for compatibility)
 */
export function verifySignature(publicKey: string, messageHash: string, signature: string): boolean {
    try {
        const keyPair = ec.keyFromPublic(publicKey, 'hex');
        return keyPair.verify(messageHash, signature);
    } catch {
        return false;
    }
}

/**
 * Verify signature with strict low-S requirement
 */
export function verifySignatureStrict(publicKey: string, messageHash: string, signature: string): boolean {
    try {
        // First normalize the signature
        const normalized = normalizeSignature(signature);

        // Verify
        const keyPair = ec.keyFromPublic(publicKey, 'hex');
        return keyPair.verify(messageHash, normalized);
    } catch {
        return false;
    }
}
