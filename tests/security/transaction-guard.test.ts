import { describe, it, expect, beforeEach } from 'vitest';
import { SafeMath, acquireTxLock, releaseTxLock, validateTransaction, Role, grantRole, hasRole, revokeRole, createCommitment, revealCommitment } from '../../src/security/transaction-guard';

describe('SafeMath', () => {
    it('add works correctly', () => {
        expect(SafeMath.add(10, 20)).toBe(30);
    });
    it('add throws on overflow', () => {
        expect(() => SafeMath.add(Number.MAX_SAFE_INTEGER, 1)).toThrow('Overflow');
    });
    it('sub works correctly', () => {
        expect(SafeMath.sub(30, 10)).toBe(20);
    });
    it('sub throws on underflow', () => {
        expect(() => SafeMath.sub(10, 20)).toThrow('Underflow');
    });
    it('mul works correctly', () => {
        expect(SafeMath.mul(3, 5)).toBe(15);
    });
    it('div works correctly', () => {
        expect(SafeMath.div(20, 4)).toBe(5);
    });
    it('div throws on division by zero', () => {
        expect(() => SafeMath.div(10, 0)).toThrow('Division by zero');
    });
});

describe('Transaction Lock', () => {
    const addr = 'EDUtest1234567890';
    beforeEach(() => { releaseTxLock(addr); });
    it('acquireTxLock returns true for new address', () => {
        expect(acquireTxLock(addr)).toBe(true);
    });
    it('acquireTxLock returns false for locked address', () => {
        acquireTxLock(addr);
        expect(acquireTxLock(addr)).toBe(false);
    });
    it('releaseTxLock allows re-acquire', () => {
        acquireTxLock(addr);
        releaseTxLock(addr);
        expect(acquireTxLock(addr)).toBe(true);
    });
});

describe('Transaction Validation', () => {
    it('valid transaction passes', () => {
        const from = 'EDUfrom1234567890123456789012345678901234';
        const to = 'EDUto12345678901234567890123456789012345';
        const result = validateTransaction(from, to, 10, 0.1);
        expect(result.valid).toBe(true);
    });
    it('rejects tiny amount', () => {
        const result = validateTransaction('EDUfrom', 'EDUto123456789012345678901234567890123456', 0.00001, 0.1);
        expect(result.valid).toBe(false);
    });
    it('rejects sending to self', () => {
        const addr = 'EDUsame123456789012345678901234567890123';
        const result = validateTransaction(addr, addr, 10, 0.1);
        expect(result.valid).toBe(false);
    });
});

describe('Role-Based Access Control', () => {
    const addr = 'EDUrole123';
    it('grantRole and hasRole work', () => {
        grantRole(addr, Role.ADMIN);
        expect(hasRole(addr, Role.ADMIN)).toBe(true);
    });
    it('revokeRole removes permission', () => {
        grantRole(addr, Role.MINER);
        revokeRole(addr, Role.MINER);
        expect(hasRole(addr, Role.MINER)).toBe(false);
    });
});

describe('Commit-Reveal Scheme', () => {
    it('createCommitment and revealCommitment work', () => {
        const id = 'commit-1';
        const hash = 'abc123';
        const data = { tx: 'test' };
        createCommitment(id, hash, data);
        const revealed = revealCommitment(id, hash);
        expect(revealed).toEqual(data);
    });
    it('reveal with wrong hash returns null', () => {
        const id = 'commit-2';
        createCommitment(id, 'correcthash', { data: 1 });
        expect(revealCommitment(id, 'wronghash')).toBe(null);
    });
});
