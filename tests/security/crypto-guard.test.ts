import { describe, it, expect, beforeEach } from 'vitest';
import { secureRandom, secureRandomHex, secureRandomInt, generateNonce, validateNonce, recordNonce, validateAndRecordNonce, normalizeSignature, isLowSSignature, constantTimeCompare } from '../../src/security/crypto-guard';

describe('Secure Random', () => {
    it('generates buffer of correct length', () => {
        const buf = secureRandom(16);
        expect(buf.length).toBe(16);
    });
    it('generates hex of correct length', () => {
        const hex = secureRandomHex(8);
        expect(hex.length).toBe(16);
    });
    it('generates int within range', () => {
        const int = secureRandomInt(10, 100);
        expect(int).toBeGreaterThanOrEqual(10);
        expect(int).toBeLessThan(100);
    });
});

describe('Nonce Tracking', () => {
    const addr = 'EDUnonce123';
    it('generateNonce creates unique nonces', () => {
        const n1 = generateNonce();
        const n2 = generateNonce();
        expect(n1).not.toBe(n2);
    });
    it('validateNonce returns true for new nonce', () => {
        expect(validateNonce(addr, 'new-nonce-123')).toBe(true);
    });
    it('validateAndRecordNonce blocks reuse', () => {
        const nonce = generateNonce();
        expect(validateAndRecordNonce(addr, nonce)).toBe(true);
        expect(validateAndRecordNonce(addr, nonce)).toBe(false);
    });
});

describe('Signature Security', () => {
    it('normalizeSignature returns valid object', () => {
        const r = 'a'.repeat(64);
        const s = 'b'.repeat(64);
        const result = normalizeSignature(r, s);
        expect(result.r).toBe(r);
        expect(typeof result.s).toBe('string');
    });
    it('isLowSSignature returns boolean', () => {
        expect(typeof isLowSSignature('1'.repeat(64))).toBe('boolean');
    });
});

describe('Constant Time Compare', () => {
    it('returns true for equal strings', () => {
        expect(constantTimeCompare('test123', 'test123')).toBe(true);
    });
    it('returns false for different strings', () => {
        expect(constantTimeCompare('test123', 'test124')).toBe(false);
    });
    it('returns false for different lengths', () => {
        expect(constantTimeCompare('test', 'test123')).toBe(false);
    });
});
