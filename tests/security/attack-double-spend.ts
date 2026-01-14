#!/usr/bin/env tsx
import { SafeMath } from '../../src/security/transaction-guard.js';

console.log('🔴 Attack Simulation: Double Spending\n');

let confirmedBalance = 100;
let pendingOutgoing = 0;

function getAvailableBalance(): number {
    return SafeMath.sub(confirmedBalance, pendingOutgoing);
}

function createPendingTx(amount: number, fee: number): boolean {
    const totalCost = SafeMath.add(amount, fee);
    const available = getAvailableBalance();
    if (available < totalCost) {
        console.log(`❌ Tx rejected: Available ${available.toFixed(2)}, Need ${totalCost.toFixed(2)}`);
        return false;
    }
    pendingOutgoing = SafeMath.add(pendingOutgoing, totalCost);
    console.log(`✅ Tx accepted: ${amount} + ${fee} fee, Available now: ${getAvailableBalance().toFixed(2)}`);
    return true;
}

console.log(`Initial balance: ${confirmedBalance}`);
console.log(`Available balance: ${getAvailableBalance()}\n`);

console.log('--- Attempting double-spend attack ---');
console.log('Tx1: Send 60 EDU...');
const tx1 = createPendingTx(60, 0.1);

console.log('Tx2: Send 60 EDU (should fail - double spend)...');
const tx2 = createPendingTx(60, 0.1);

console.log('\n--- Result ---');
console.log(`Tx1 accepted: ${tx1 ? '✅' : '❌'}`);
console.log(`Tx2 rejected: ${!tx2 ? '✅' : '❌'}`);
console.log(`Double-spend prevention: ${tx1 && !tx2 ? '✅ PASSED' : '❌ FAILED'}`);
