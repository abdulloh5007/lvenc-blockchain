import crypto from 'crypto';

/**
 * Calculate SHA-256 hash of data
 */
export function sha256(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Calculate double SHA-256 hash (like Bitcoin)
 */
export function doubleSha256(data: string): string {
    return sha256(sha256(data));
}

/**
 * Generate a random hex string
 */
export function randomHex(bytes: number = 32): string {
    return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Check if a hash meets the difficulty requirement
 * Difficulty = number of leading zeros
 */
export function hashMeetsDifficulty(hash: string, difficulty: number): boolean {
    const prefix = '0'.repeat(difficulty);
    return hash.startsWith(prefix);
}

/**
 * Convert a public key to a short address
 */
export function publicKeyToAddress(publicKey: string): string {
    const hash = sha256(publicKey);
    return 'EDU' + hash.substring(0, 40); // 43 characters total
}
