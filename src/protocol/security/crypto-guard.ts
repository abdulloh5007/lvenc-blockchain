import * as crypto from 'crypto';
import { logger } from '../utils/logger.js';

const usedNonces = new Map<string, Set<string>>();
const NONCE_WINDOW = 24 * 60 * 60 * 1000;

export function secureRandom(bytes: number = 32): Buffer {
    return crypto.randomBytes(bytes);
}

export function secureRandomHex(bytes: number = 32): string {
    return secureRandom(bytes).toString('hex');
}

export function secureRandomInt(min: number, max: number): number {
    const range = max - min;
    const bytesNeeded = Math.ceil(Math.log2(range) / 8) || 1;
    const maxValid = Math.floor(256 ** bytesNeeded / range) * range;
    let value: number;
    do {
        value = parseInt(secureRandom(bytesNeeded).toString('hex'), 16);
    } while (value >= maxValid);
    return min + (value % range);
}

export function generateNonce(): string {
    return `${Date.now()}-${secureRandomHex(8)}`;
}

export function validateNonce(address: string, nonce: string): boolean {
    const addressNonces = usedNonces.get(address);
    if (addressNonces?.has(nonce)) {
        logger.warn(`🚨 Nonce reuse detected: ${address}`);
        return false;
    }
    return true;
}

export function recordNonce(address: string, nonce: string): void {
    let addressNonces = usedNonces.get(address);
    if (!addressNonces) {
        addressNonces = new Set();
        usedNonces.set(address, addressNonces);
    }
    addressNonces.add(nonce);
}

export function validateAndRecordNonce(address: string, nonce: string): boolean {
    if (!validateNonce(address, nonce)) return false;
    recordNonce(address, nonce);
    return true;
}

export function normalizeSignature(r: string, s: string): { r: string; s: string } {
    const n = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');
    const halfN = n / 2n;
    let sValue = BigInt('0x' + s);
    if (sValue > halfN) {
        sValue = n - sValue;
    }
    return { r, s: sValue.toString(16).padStart(64, '0') };
}

export function isLowSSignature(s: string): boolean {
    const n = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');
    const halfN = n / 2n;
    return BigInt('0x' + s) <= halfN;
}

export function hashWithSalt(data: string, salt?: string): { hash: string; salt: string } {
    const useSalt = salt || secureRandomHex(16);
    const hash = crypto.createHash('sha256').update(data + useSalt).digest('hex');
    return { hash, salt: useSalt };
}

export function verifyHashWithSalt(data: string, salt: string, expectedHash: string): boolean {
    const { hash } = hashWithSalt(data, salt);
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expectedHash, 'hex'));
}

export function deriveKey(password: string, salt: string, iterations: number = 100000): Buffer {
    return crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
}

export function encryptData(data: string, key: Buffer): { encrypted: string; iv: string } {
    const iv = secureRandom(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return {
        encrypted: Buffer.concat([encrypted, authTag]).toString('hex'),
        iv: iv.toString('hex')
    };
}

export function decryptData(encrypted: string, key: Buffer, iv: string): string | null {
    try {
        const data = Buffer.from(encrypted, 'hex');
        const authTag = data.slice(-16);
        const encryptedData = data.slice(0, -16);
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
        decipher.setAuthTag(authTag);
        return decipher.update(encryptedData) + decipher.final('utf8');
    } catch {
        logger.warn('🚨 Decryption failed');
        return null;
    }
}

export function constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

setInterval(() => {
    const now = Date.now();
    for (const [address, nonces] of usedNonces) {
        for (const nonce of nonces) {
            const timestamp = parseInt(nonce.split('-')[0], 10);
            if (now - timestamp > NONCE_WINDOW) nonces.delete(nonce);
        }
        if (nonces.size === 0) usedNonces.delete(address);
    }
}, 60 * 60 * 1000);
