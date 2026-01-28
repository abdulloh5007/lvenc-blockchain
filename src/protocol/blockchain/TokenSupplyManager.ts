/**
 * Token Supply Manager
 * Fixed supply tokenomics with allocation tracking
 * 
 * SUPPLY POLICY:
 * - Max supply: 70,000,000 LVE (FIXED, IMMUTABLE)
 * - Minting: DISABLED FOREVER
 * - Burning: ENABLED (with epoch cap)
 * 
 * ALLOCATION:
 * - Staking/Validators: 28,000,000 (40%)
 * - Ecosystem Growth:   17,500,000 (25%)
 * - Treasury:           10,500,000 (15%)
 * - Team Vesting:        8,400,000 (12%)
 * - Liquidity:           5,600,000 (8%)
 */

import { logger } from '../utils/logger.js';

// ========== IMMUTABLE CONSTANTS ==========
const MAX_SUPPLY = 70_000_000;
const MINTING_DISABLED = true;

// Allocation amounts (immutable)
const ALLOCATIONS = {
    STAKING_VALIDATORS: 28_000_000,   // 40% - network security
    ECOSYSTEM_GROWTH: 17_500_000,     // 25% - users, devs, partners
    TREASURY: 10_500_000,             // 15% - protocol reserve
    TEAM_VESTING: 8_400_000,          // 12% - long-term alignment
    LIQUIDITY: 5_600_000,             // 8%  - market bootstrap
} as const;

type AllocationCategory = keyof typeof ALLOCATIONS;

interface AllocationState {
    total: number;
    released: number;
    locked: number;
    burned: number;
}

interface SupplySnapshot {
    timestamp: number;
    blockIndex: number;
    totalSupply: number;
    circulatingSupply: number;
    lockedSupply: number;
    burnedSupply: number;
}

export class TokenSupplyManager {
    private allocations: Map<AllocationCategory, AllocationState> = new Map();
    private totalBurned: number = 0;
    private snapshots: SupplySnapshot[] = [];
    private log = logger.child('TokenSupply');

    constructor() {
        // Initialize allocations
        for (const [category, amount] of Object.entries(ALLOCATIONS)) {
            this.allocations.set(category as AllocationCategory, {
                total: amount,
                released: 0,
                locked: amount,
                burned: 0,
            });
        }
        this.log.info(`● TokenSupply initialized: ${MAX_SUPPLY.toLocaleString()} LVE max supply`);
    }

    // ========== SUPPLY QUERIES ==========

    /**
     * Get maximum supply (immutable)
     */
    getMaxSupply(): number {
        return MAX_SUPPLY;
    }

    /**
     * Get current total supply (max - burned)
     */
    getTotalSupply(): number {
        return MAX_SUPPLY - this.totalBurned;
    }

    /**
     * Get circulating supply (released tokens)
     */
    getCirculatingSupply(): number {
        let circulating = 0;
        for (const state of this.allocations.values()) {
            circulating += state.released - state.burned;
        }
        return circulating;
    }

    /**
     * Get locked supply (not yet released)
     */
    getLockedSupply(): number {
        let locked = 0;
        for (const state of this.allocations.values()) {
            locked += state.locked;
        }
        return locked;
    }

    /**
     * Get total burned
     */
    getTotalBurned(): number {
        return this.totalBurned;
    }

    // ========== ALLOCATION MANAGEMENT ==========

    /**
     * Get allocation state for a category
     */
    getAllocation(category: AllocationCategory): AllocationState {
        const state = this.allocations.get(category);
        if (!state) throw new Error(`Unknown allocation: ${category}`);
        return { ...state };
    }

    /**
     * Release tokens from locked to circulating
     * Used for: staking rewards, ecosystem grants, team vesting unlocks
     */
    releaseTokens(category: AllocationCategory, amount: number, blockIndex: number): boolean {
        const state = this.allocations.get(category);
        if (!state) throw new Error(`Unknown allocation: ${category}`);

        if (amount <= 0) {
            throw new Error('Amount must be positive');
        }

        if (amount > state.locked) {
            this.log.warn(`Cannot release ${amount} from ${category}: only ${state.locked} locked`);
            return false;
        }

        state.locked -= amount;
        state.released += amount;

        this.log.info(`📤 Released ${amount.toLocaleString()} LVE from ${category}`);
        this.takeSnapshot(blockIndex);
        return true;
    }

    /**
     * Record burn (reduces total supply)
     */
    recordBurn(amount: number, category: AllocationCategory | 'CIRCULATING', blockIndex: number): void {
        if (amount <= 0) return;

        this.totalBurned += amount;

        if (category !== 'CIRCULATING') {
            const state = this.allocations.get(category);
            if (state) {
                state.burned += amount;
            }
        }

        this.log.info(`🔥 Burned ${amount.toLocaleString()} LVE | Total burned: ${this.totalBurned.toLocaleString()}`);
        this.takeSnapshot(blockIndex);
    }

    // ========== MINTING (DISABLED) ==========

    /**
     * Attempt to mint tokens - ALWAYS FAILS
     * Minting is permanently disabled
     */
    mint(_amount: number): never {
        if (MINTING_DISABLED) {
            throw new Error('MINTING IS PERMANENTLY DISABLED. Max supply is fixed at 70,000,000 LVE.');
        }
        throw new Error('Unreachable');
    }

    /**
     * Check if minting is allowed (always false)
     */
    canMint(): boolean {
        return !MINTING_DISABLED;
    }

    // ========== SNAPSHOTS ==========

    /**
     * Take a supply snapshot
     */
    private takeSnapshot(blockIndex: number): void {
        const snapshot: SupplySnapshot = {
            timestamp: Date.now(),
            blockIndex,
            totalSupply: this.getTotalSupply(),
            circulatingSupply: this.getCirculatingSupply(),
            lockedSupply: this.getLockedSupply(),
            burnedSupply: this.totalBurned,
        };

        this.snapshots.push(snapshot);

        // Keep only last 100 snapshots
        if (this.snapshots.length > 100) {
            this.snapshots = this.snapshots.slice(-100);
        }
    }

    /**
     * Get supply summary
     */
    getSummary(): {
        maxSupply: number;
        totalSupply: number;
        circulatingSupply: number;
        lockedSupply: number;
        burnedSupply: number;
        mintingEnabled: boolean;
        allocations: Record<string, AllocationState>;
    } {
        const allocations: Record<string, AllocationState> = {};
        for (const [cat, state] of this.allocations) {
            allocations[cat] = { ...state };
        }

        return {
            maxSupply: MAX_SUPPLY,
            totalSupply: this.getTotalSupply(),
            circulatingSupply: this.getCirculatingSupply(),
            lockedSupply: this.getLockedSupply(),
            burnedSupply: this.totalBurned,
            mintingEnabled: !MINTING_DISABLED,
            allocations,
        };
    }

    /**
     * Export for persistence
     */
    toJSON(): object {
        return {
            totalBurned: this.totalBurned,
            allocations: Object.fromEntries(this.allocations),
            snapshots: this.snapshots.slice(-10),
        };
    }

    /**
     * Load from persistence
     */
    loadFromData(data: any): void {
        if (data.totalBurned) this.totalBurned = data.totalBurned;
        if (data.allocations) {
            for (const [cat, state] of Object.entries(data.allocations)) {
                this.allocations.set(cat as AllocationCategory, state as AllocationState);
            }
        }
        if (data.snapshots) this.snapshots = data.snapshots;
        this.log.info(`📂 Loaded supply data: ${this.getTotalSupply().toLocaleString()} LVE total`);
    }
}

export const tokenSupplyManager = new TokenSupplyManager();

// Export constants
export { MAX_SUPPLY, ALLOCATIONS, MINTING_DISABLED };
