import crypto from 'crypto';
import elliptic from 'elliptic';
import { config } from '../config.js';
const EC = new elliptic.ec('secp256k1');
export function sha256(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
}
export function doubleSha256(data: string): string {
    return sha256(sha256(data));
}
export function randomHex(bytes: number = 32): string {
    return crypto.randomBytes(bytes).toString('hex');
}
export function hashMeetsDifficulty(hash: string, difficulty: number): boolean {
    const prefix = '0'.repeat(difficulty);
    return hash.startsWith(prefix);
}
export function publicKeyToAddress(publicKey: string): string {
    const hash = sha256(publicKey);
    return config.blockchain.addressPrefix + hash.substring(0, 40);
}
export function verifySignature(hash: string, signature: string, publicKey: string): boolean {
    try {
        const key = EC.keyFromPublic(publicKey, 'hex');
        return key.verify(hash, signature);
    } catch {
        return false;
    }
}
