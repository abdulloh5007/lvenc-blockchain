#!/usr/bin/env tsx
import { acquireTxLock, releaseTxLock } from '../../src/security/transaction-guard.js';

console.log('🔴 Attack Simulation: Reentrancy\n');

const attackerAddress = 'EDUattacker12345678901234567890123456';
let balance = 100;

console.log(`Initial balance: ${balance}`);
console.log('\n--- Attempting reentrancy attack ---');

function maliciousWithdraw(amount: number, depth: number = 0): boolean {
    if (depth > 3) return false;
    console.log(`  [Depth ${depth}] Attempting withdraw ${amount}`);
    if (!acquireTxLock(attackerAddress)) {
        console.log(`  ✅ Lock blocked reentrancy at depth ${depth}`);
        return false;
    }
    try {
        if (balance >= amount) {
            console.log(`  [Depth ${depth}] Balance check passed, attempting nested call...`);
            const nestedResult = maliciousWithdraw(amount, depth + 1);
            if (!nestedResult || depth === 0) {
                balance -= amount;
                console.log(`  [Depth ${depth}] Withdrew ${amount}, balance: ${balance}`);
            }
            return true;
        }
    } finally {
        releaseTxLock(attackerAddress);
    }
    return false;
}

maliciousWithdraw(30);

console.log('\n--- Result ---');
console.log(`Final balance: ${balance}`);
console.log(`Reentrancy protection: ${balance === 70 ? '✅ PASSED (only 1 withdrawal)' : '❌ FAILED'}`);
