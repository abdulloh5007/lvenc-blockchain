/**
 * USDT Balance Manager (Testnet Only)
 * 
 * Manages mock USDT balances for testnet swap testing.
 * 
 * IMPORTANT:
 * - This is ONLY for testnet!
 * - USDT is NOT created/minted - it's a mock for testing
 * - Mainnet will require bridge integration (later)
 * - No custody, no fiat handling
 */

import { logger } from '../../protocol/utils/logger.js';
import { chainParams } from '../../protocol/params/index.js';

const log = logger.child('USDTBalance');

// Faucet configuration
const FAUCET_AMOUNT = 1000;          // 1000 USDT per request
const FAUCET_COOLDOWN_MS = 60000;    // 1 minute cooldown
const MAX_BALANCE = 100000;           // Max 100K USDT per address

interface USDTBalance {
    address: string;
    balance: number;
    lastFaucetRequest: number;
}

export class USDTBalanceManager {
    private balances: Map<string, USDTBalance> = new Map();
    private isTestnet: boolean;

    constructor() {
        this.isTestnet = chainParams.isTestnet;
        if (!this.isTestnet) {
            log.warn('⚠️ USDT faucet is TESTNET ONLY. Disabled on mainnet.');
        }
    }

    /**
     * Get USDT balance for an address
     */
    getBalance(address: string): number {
        return this.balances.get(address)?.balance || 0;
    }

    /**
     * Request USDT from faucet (testnet only)
     */
    requestFromFaucet(address: string): {
        success: boolean;
        amount: number;
        balance: number;
        error?: string;
    } {
        if (!this.isTestnet) {
            return {
                success: false,
                amount: 0,
                balance: 0,
                error: 'USDT faucet is only available on testnet',
            };
        }

        let record = this.balances.get(address);

        // Check cooldown
        if (record && Date.now() - record.lastFaucetRequest < FAUCET_COOLDOWN_MS) {
            const waitTime = Math.ceil((FAUCET_COOLDOWN_MS - (Date.now() - record.lastFaucetRequest)) / 1000);
            return {
                success: false,
                amount: 0,
                balance: record.balance,
                error: `Cooldown active. Wait ${waitTime} seconds.`,
            };
        }

        // Check max balance
        if (record && record.balance >= MAX_BALANCE) {
            return {
                success: false,
                amount: 0,
                balance: record.balance,
                error: `Max balance reached (${MAX_BALANCE} USDT)`,
            };
        }

        // Create or update record
        if (!record) {
            record = {
                address,
                balance: 0,
                lastFaucetRequest: 0,
            };
        }

        record.balance += FAUCET_AMOUNT;
        record.lastFaucetRequest = Date.now();
        this.balances.set(address, record);

        log.info(`💧 USDT Faucet: ${FAUCET_AMOUNT} USDT → ${address.slice(0, 16)}...`);

        return {
            success: true,
            amount: FAUCET_AMOUNT,
            balance: record.balance,
        };
    }

    /**
     * Deduct USDT for swap (internal use)
     */
    deductForSwap(address: string, amount: number): boolean {
        const record = this.balances.get(address);
        if (!record || record.balance < amount) {
            return false;
        }

        record.balance -= amount;
        this.balances.set(address, record);
        return true;
    }

    /**
     * Credit USDT from swap (internal use)
     */
    creditFromSwap(address: string, amount: number): void {
        let record = this.balances.get(address);
        if (!record) {
            record = {
                address,
                balance: 0,
                lastFaucetRequest: 0,
            };
        }
        record.balance += amount;
        this.balances.set(address, record);
    }

    /**
     * Check if address has sufficient USDT
     */
    hasSufficientBalance(address: string, amount: number): boolean {
        return this.getBalance(address) >= amount;
    }

    /**
     * Get faucet info
     */
    getFaucetInfo(): {
        enabled: boolean;
        amount: number;
        cooldownMs: number;
        maxBalance: number;
    } {
        return {
            enabled: this.isTestnet,
            amount: FAUCET_AMOUNT,
            cooldownMs: FAUCET_COOLDOWN_MS,
            maxBalance: MAX_BALANCE,
        };
    }

    /**
     * Export for persistence
     */
    toJSON(): object {
        return {
            balances: Object.fromEntries(this.balances),
        };
    }

    /**
     * Load from persistence
     */
    loadFromData(data: any): void {
        if (data.balances) {
            for (const [addr, record] of Object.entries(data.balances)) {
                this.balances.set(addr, record as USDTBalance);
            }
        }
        log.info(`📂 Loaded ${this.balances.size} USDT balances`);
    }
}

export const usdtBalanceManager = new USDTBalanceManager();

// Export constants
export { FAUCET_AMOUNT, FAUCET_COOLDOWN_MS, MAX_BALANCE };
