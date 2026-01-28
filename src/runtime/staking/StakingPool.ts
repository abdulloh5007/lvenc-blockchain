import { logger } from '../../protocol/utils/logger.js';
import { sha256 } from '../../protocol/utils/crypto.js';
import { chainParams } from '../../protocol/params/index.js';
import type { GenesisValidator } from '../../protocol/consensus/index.js';

// Interfaces
export interface StakeInfo {
    address: string;
    amount: number;
    stakedAt: number;
    lastReward: number;
    epochStaked: number;
}

export interface Delegation {
    delegator: string;
    validator: string;
    amount: number;
    delegatedAt: number;
    epochDelegated: number;
}

export interface PendingStake {
    address: string;
    amount: number;
    epochEffective: number;
}

export interface PendingDelegation {
    delegator: string;
    validator: string;
    amount: number;
    epochEffective: number;
}

export interface UnstakeRequest {
    address: string;
    amount: number;
    requestedAt: number;
    epochEffective: number;
}

export interface ValidatorInfo {
    address: string;
    stake: number;
    delegatedStake: number;
    commission: number; // 0-100%
    blocksCreated: number;
    totalRewards: number;
    slashCount: number;
    isActive: boolean;
    // Jailing status
    isJailed: boolean;
    jailedUntilEpoch: number;  // Epoch when jail ends (0 = not jailed)
    jailCount: number;          // Total times jailed
}

export interface EpochInfo {
    epoch: number;
    startBlock: number;
    endBlock: number;
    startTime: number;
}

// Constants from chain params
const MIN_STAKE = chainParams.staking.minValidatorSelfStake;
const MIN_DELEGATION = chainParams.staking.minDelegation;
const EPOCH_DURATION = chainParams.staking.epochDuration;
const DEFAULT_COMMISSION = chainParams.staking.defaultCommission;
const SLASH_PERCENT = chainParams.staking.slashPercent;
const UNBONDING_EPOCHS = chainParams.staking.unbondingEpochs;
const JAIL_DURATION_EPOCHS = chainParams.staking.jailDurationEpochs;
const MAX_JAIL_COUNT = chainParams.staking.maxJailCount;

export class StakingPool {
    private stakes: Map<string, StakeInfo> = new Map();
    private delegations: Map<string, Delegation[]> = new Map(); // delegator -> delegations
    private validatorDelegations: Map<string, number> = new Map(); // validator -> total delegated
    private pendingStakes: Map<string, PendingStake> = new Map();
    private pendingDelegations: PendingDelegation[] = [];
    private pendingUnstakes: Map<string, UnstakeRequest[]> = new Map();
    private validators: Map<string, ValidatorInfo> = new Map();
    private currentEpoch: number = 0;
    private epochStartBlock: number = 0;
    private epochStartTime: number = Date.now();
    private log = logger.child('Staking');

    // ========== EPOCH MANAGEMENT ==========

    getEpochDuration(): number { return EPOCH_DURATION; }

    getCurrentEpoch(): number { return this.currentEpoch; }

    getEpochInfo(): EpochInfo {
        return {
            epoch: this.currentEpoch,
            startBlock: this.epochStartBlock,
            endBlock: this.epochStartBlock + EPOCH_DURATION - 1,
            startTime: this.epochStartTime,
        };
    }

    shouldTransitionEpoch(currentBlockIndex: number): boolean {
        return currentBlockIndex >= this.epochStartBlock + EPOCH_DURATION;
    }

    transitionEpoch(newBlockIndex: number): void {
        this.currentEpoch++;
        this.epochStartBlock = newBlockIndex;
        this.epochStartTime = Date.now();

        // Process pending stakes
        for (const [address, pending] of this.pendingStakes) {
            if (pending.epochEffective <= this.currentEpoch) {
                const existing = this.stakes.get(address);
                if (existing) {
                    existing.amount += pending.amount;
                } else {
                    this.stakes.set(address, {
                        address,
                        amount: pending.amount,
                        stakedAt: Date.now(),
                        lastReward: Date.now(),
                        epochStaked: this.currentEpoch,
                    });
                }
                this.pendingStakes.delete(address);
                this.updateValidator(address);
                this.log.info(`✅ Epoch ${this.currentEpoch}: Stake activated for ${address.slice(0, 10)}...`);
            }
        }

        // Process pending delegations
        const remainingDelegations: PendingDelegation[] = [];
        for (const pending of this.pendingDelegations) {
            if (pending.epochEffective <= this.currentEpoch) {
                this.activateDelegation(pending);
            } else {
                remainingDelegations.push(pending);
            }
        }
        this.pendingDelegations = remainingDelegations;

        // Process pending unstakes
        for (const [address, requests] of this.pendingUnstakes) {
            const remaining = requests.filter(r => {
                if (r.epochEffective <= this.currentEpoch) {
                    this.log.info(`✅ Epoch ${this.currentEpoch}: Unstake completed for ${address.slice(0, 10)}...`);
                    return false;
                }
                return true;
            });
            if (remaining.length === 0) {
                this.pendingUnstakes.delete(address);
            } else {
                this.pendingUnstakes.set(address, remaining);
            }
        }

        // Auto-unjail validators whose jail period has expired
        for (const [address, validator] of this.validators) {
            if (validator.isJailed &&
                validator.jailedUntilEpoch !== Number.MAX_SAFE_INTEGER &&
                validator.jailedUntilEpoch <= this.currentEpoch) {
                this.unjailValidator(address);
            }
        }

        this.log.info(`🔄 Epoch transition: ${this.currentEpoch - 1} → ${this.currentEpoch}`);
    }

    // ========== STAKING ==========

    stake(address: string, amount: number): boolean {
        if (amount < MIN_STAKE) {
            this.log.warn(`Stake too low: ${amount} < ${MIN_STAKE}`);
            return false;
        }

        // BOOTSTRAP MODE: If no active validators, first stake activates immediately
        const activeValidators = this.getValidators();
        if (activeValidators.length === 0) {
            this.log.info(`● BOOTSTRAP: No validators, activating stake immediately`);
            this.stakes.set(address, {
                address,
                amount,
                stakedAt: Date.now(),
                lastReward: Date.now(),
                epochStaked: this.currentEpoch,
            });
            this.updateValidator(address);
            return true;
        }

        const epochEffective = this.currentEpoch + 1;
        const existing = this.pendingStakes.get(address);

        if (existing) {
            existing.amount += amount;
        } else {
            this.pendingStakes.set(address, {
                address,
                amount,
                epochEffective,
            });
        }

        this.log.info(`📊 Stake queued: ${amount} LVE from ${address.slice(0, 10)}... (effective epoch ${epochEffective})`);
        return true;
    }

    requestUnstake(address: string, amount: number): UnstakeRequest | null {
        const stake = this.stakes.get(address);
        if (!stake || stake.amount < amount) {
            this.log.warn(`Insufficient stake for unstake: ${stake?.amount || 0} < ${amount}`);
            return null;
        }

        // Unbonding period: funds locked for UNBONDING_EPOCHS
        const epochEffective = this.currentEpoch + UNBONDING_EPOCHS;
        const request: UnstakeRequest = {
            address,
            amount,
            requestedAt: Date.now(),
            epochEffective,
        };

        const requests = this.pendingUnstakes.get(address) || [];
        requests.push(request);
        this.pendingUnstakes.set(address, requests);

        stake.amount -= amount;
        this.stakes.set(address, stake);
        this.updateValidator(address);

        this.log.info(`🔓 Unstake queued: ${amount} LVE (unbonding ${UNBONDING_EPOCHS} epochs, effective epoch ${epochEffective})`);
        return request;
    }

    completeUnstake(address: string): number {
        const requests = this.pendingUnstakes.get(address) || [];
        let totalReleased = 0;

        const remaining = requests.filter(r => {
            if (r.epochEffective <= this.currentEpoch) {
                totalReleased += r.amount;
                return false;
            }
            return true;
        });

        this.pendingUnstakes.set(address, remaining);
        if (totalReleased > 0) {
            this.log.info(`✅ Released ${totalReleased} LVE from unstake`);
        }
        return totalReleased;
    }

    // ========== DELEGATION ==========

    delegate(delegator: string, validator: string, amount: number): boolean {
        if (amount < MIN_DELEGATION) {
            this.log.warn(`Delegation too low: ${amount} < ${MIN_DELEGATION}`);
            return false;
        }

        const validatorStake = this.stakes.get(validator);
        if (!validatorStake || validatorStake.amount < MIN_STAKE) {
            this.log.warn(`Cannot delegate to non-validator: ${validator}`);
            return false;
        }

        const epochEffective = this.currentEpoch + 1;
        this.pendingDelegations.push({
            delegator,
            validator,
            amount,
            epochEffective,
        });

        this.log.info(`📊 Delegation queued: ${amount} LVE from ${delegator.slice(0, 10)}... to ${validator.slice(0, 10)}... (effective epoch ${epochEffective})`);
        return true;
    }

    private activateDelegation(pending: PendingDelegation): void {
        const delegation: Delegation = {
            delegator: pending.delegator,
            validator: pending.validator,
            amount: pending.amount,
            delegatedAt: Date.now(),
            epochDelegated: this.currentEpoch,
        };

        const existing = this.delegations.get(pending.delegator) || [];
        const sameValidator = existing.find(d => d.validator === pending.validator);
        if (sameValidator) {
            sameValidator.amount += pending.amount;
        } else {
            existing.push(delegation);
        }
        this.delegations.set(pending.delegator, existing);

        // Update validator total
        const currentTotal = this.validatorDelegations.get(pending.validator) || 0;
        this.validatorDelegations.set(pending.validator, currentTotal + pending.amount);

        // Update validator info
        const validator = this.validators.get(pending.validator);
        if (validator) {
            validator.delegatedStake = this.validatorDelegations.get(pending.validator) || 0;
            this.validators.set(pending.validator, validator);
        }

        this.log.info(`✅ Delegation activated: ${pending.amount} LVE to ${pending.validator.slice(0, 10)}...`);
    }

    undelegate(delegator: string, validator: string, amount: number): boolean {
        const delegatorList = this.delegations.get(delegator) || [];
        const delegation = delegatorList.find(d => d.validator === validator);

        if (!delegation || delegation.amount < amount) {
            this.log.warn(`Insufficient delegation to undelegate`);
            return false;
        }

        delegation.amount -= amount;
        if (delegation.amount === 0) {
            this.delegations.set(delegator, delegatorList.filter(d => d.validator !== validator));
        }

        const currentTotal = this.validatorDelegations.get(validator) || 0;
        this.validatorDelegations.set(validator, Math.max(0, currentTotal - amount));

        const validatorInfo = this.validators.get(validator);
        if (validatorInfo) {
            validatorInfo.delegatedStake = this.validatorDelegations.get(validator) || 0;
            this.validators.set(validator, validatorInfo);
        }

        this.log.info(`🔓 Undelegated: ${amount} LVE from ${validator.slice(0, 10)}...`);
        return true;
    }

    getDelegations(delegator: string): Delegation[] {
        return this.delegations.get(delegator) || [];
    }

    getValidatorDelegators(validator: string): { delegator: string; amount: number }[] {
        const result: { delegator: string; amount: number }[] = [];
        for (const [delegator, delegations] of this.delegations) {
            for (const d of delegations) {
                if (d.validator === validator) {
                    result.push({ delegator, amount: d.amount });
                }
            }
        }
        return result;
    }

    // ========== REWARDS ==========

    distributeRewards(validator: string, totalReward: number): { validator: number; delegators: Map<string, number> } {
        const validatorInfo = this.validators.get(validator);
        if (!validatorInfo) return { validator: 0, delegators: new Map() };

        const commission = validatorInfo.commission || DEFAULT_COMMISSION;
        const validatorReward = totalReward * (commission / 100);
        const delegatorPool = totalReward - validatorReward;

        const delegatorRewards = new Map<string, number>();
        const totalDelegated = this.validatorDelegations.get(validator) || 0;

        if (totalDelegated > 0) {
            const delegators = this.getValidatorDelegators(validator);
            for (const { delegator, amount } of delegators) {
                const share = (amount / totalDelegated) * delegatorPool;
                delegatorRewards.set(delegator, share);
            }
        }

        validatorInfo.totalRewards += validatorReward;
        this.validators.set(validator, validatorInfo);

        return { validator: validatorReward, delegators: delegatorRewards };
    }

    // ========== SLASHING ==========

    slash(address: string, reason: string): number {
        const stake = this.stakes.get(address);
        if (!stake) return 0;

        const slashAmount = Math.floor(stake.amount * (SLASH_PERCENT / 100));
        stake.amount -= slashAmount;
        this.stakes.set(address, stake);

        const validator = this.validators.get(address);
        if (validator) {
            validator.slashCount++;
            this.validators.set(address, validator);

            // Auto-jail on slash
            this.jailValidator(address, reason);
        }

        this.updateValidator(address);
        this.log.warn(`⚠️ Slashed ${slashAmount} LVE from ${address.slice(0, 10)}... Reason: ${reason}`);
        return slashAmount;
    }

    // ========== JAILING ==========

    /**
     * Jail a validator for JAIL_DURATION_EPOCHS
     * Jailed validators cannot produce blocks or earn rewards
     */
    jailValidator(address: string, reason: string): boolean {
        const validator = this.validators.get(address);
        if (!validator) return false;

        validator.jailCount++;

        // Permanent ban after MAX_JAIL_COUNT jails
        if (validator.jailCount >= MAX_JAIL_COUNT) {
            validator.isJailed = true;
            validator.jailedUntilEpoch = Number.MAX_SAFE_INTEGER;  // Permanent
            validator.isActive = false;
            this.validators.set(address, validator);
            this.log.warn(`🔒 PERMANENTLY BANNED: ${address.slice(0, 10)}... (${validator.jailCount} jails)`);
            return true;
        }

        validator.isJailed = true;
        validator.jailedUntilEpoch = this.currentEpoch + JAIL_DURATION_EPOCHS;
        validator.isActive = false;
        this.validators.set(address, validator);

        this.log.warn(`🔒 JAILED: ${address.slice(0, 10)}... until epoch ${validator.jailedUntilEpoch}. Reason: ${reason}`);
        return true;
    }

    /**
     * Unjail a validator (called automatically at epoch transition or manually)
     */
    unjailValidator(address: string): boolean {
        const validator = this.validators.get(address);
        if (!validator || !validator.isJailed) return false;

        // Cannot unjail if permanent ban
        if (validator.jailedUntilEpoch === Number.MAX_SAFE_INTEGER) {
            this.log.warn(`Cannot unjail ${address.slice(0, 10)}...: permanent ban`);
            return false;
        }

        // Cannot unjail before time
        if (this.currentEpoch < validator.jailedUntilEpoch) {
            this.log.warn(`Cannot unjail ${address.slice(0, 10)}...: ${validator.jailedUntilEpoch - this.currentEpoch} epochs remaining`);
            return false;
        }

        validator.isJailed = false;
        validator.jailedUntilEpoch = 0;

        // Re-activate if stake is sufficient
        const stake = this.stakes.get(address);
        if (stake && stake.amount >= MIN_STAKE) {
            validator.isActive = true;
        }

        this.validators.set(address, validator);
        this.log.info(`🔓 UNJAILED: ${address.slice(0, 10)}...`);
        return true;
    }

    /**
     * Check if validator is currently jailed
     */
    isValidatorJailed(address: string): boolean {
        const validator = this.validators.get(address);
        return validator?.isJailed ?? false;
    }

    // ========== VALIDATOR MANAGEMENT ==========

    private updateValidator(address: string): void {
        const stake = this.stakes.get(address);
        if (!stake || stake.amount < MIN_STAKE) {
            const validator = this.validators.get(address);
            if (validator) {
                validator.isActive = false;
                this.validators.set(address, validator);
            }
            return;
        }

        const existing = this.validators.get(address);
        if (existing) {
            existing.stake = stake.amount;
            existing.isActive = true;
            this.validators.set(address, existing);
        } else {
            this.validators.set(address, {
                address,
                stake: stake.amount,
                delegatedStake: 0,
                commission: DEFAULT_COMMISSION,
                blocksCreated: 0,
                totalRewards: 0,
                slashCount: 0,
                isActive: true,
                isJailed: false,
                jailedUntilEpoch: 0,
                jailCount: 0,
            });
        }
    }

    /**
     * Select validator deterministically based on seed (previous block hash + block index)
     * MUST be deterministic - all nodes must select the same validator
     * Jailed validators are excluded from selection
     */
    selectValidator(seed?: string): string | null {
        const activeValidators = Array.from(this.validators.values())
            .filter(v => v.isActive && !v.isJailed)  // Exclude jailed
            .sort((a, b) => a.address.localeCompare(b.address)); // Deterministic order

        if (activeValidators.length === 0) return null;

        // Total weight = own stake + delegated stake
        const totalWeight = activeValidators.reduce((sum, v) => sum + v.stake + v.delegatedStake, 0);

        // Deterministic random based on seed (e.g., previousBlockHash + blockIndex)
        // If no seed provided, use current epoch as fallback (still deterministic across nodes)
        const seedStr = seed || `epoch-${this.currentEpoch}`;
        const hash = sha256(seedStr);
        const randomValue = (parseInt(hash.slice(0, 8), 16) / 0xFFFFFFFF) * totalWeight;

        let cumulative = 0;
        for (const validator of activeValidators) {
            cumulative += (validator.stake + validator.delegatedStake);
            if (randomValue < cumulative) return validator.address;
        }

        return activeValidators[0].address;
    }

    recordBlockCreated(address: string): void {
        const validator = this.validators.get(address);
        if (validator) {
            validator.blocksCreated++;
            this.validators.set(address, validator);
        }
    }

    setCommission(address: string, commission: number): boolean {
        if (commission < 0 || commission > 100) return false;
        const validator = this.validators.get(address);
        if (!validator) return false;
        validator.commission = commission;
        this.validators.set(address, validator);
        return true;
    }

    // ========== GETTERS ==========

    getStake(address: string): number {
        return this.stakes.get(address)?.amount || 0;
    }

    getPendingStake(address: string): number {
        return this.pendingStakes.get(address)?.amount || 0;
    }

    getValidators(): ValidatorInfo[] {
        return Array.from(this.validators.values()).filter(v => v.isActive);
    }

    getAllValidators(): ValidatorInfo[] {
        return Array.from(this.validators.values());
    }

    getAllStakes(): StakeInfo[] {
        return Array.from(this.stakes.values());
    }

    getUnstakeRequests(address: string): UnstakeRequest[] {
        return this.pendingUnstakes.get(address) || [];
    }

    getTotalStaked(): number {
        return Array.from(this.stakes.values()).reduce((sum, s) => sum + s.amount, 0);
    }

    getTotalDelegated(): number {
        return Array.from(this.validatorDelegations.values()).reduce((sum, d) => sum + d, 0);
    }

    // ========== PERSISTENCE ==========

    toJSON() {
        return {
            currentEpoch: this.currentEpoch,
            epochStartBlock: this.epochStartBlock,
            epochStartTime: this.epochStartTime,
            stakes: this.getAllStakes(),
            validators: Array.from(this.validators.values()),
            delegations: Object.fromEntries(this.delegations),
            validatorDelegations: Object.fromEntries(this.validatorDelegations),
            pendingStakes: Array.from(this.pendingStakes.values()),
            pendingDelegations: this.pendingDelegations,
            pendingUnstakes: Object.fromEntries(this.pendingUnstakes),
        };
    }

    loadFromData(data: any): void {
        if (data.currentEpoch !== undefined) this.currentEpoch = data.currentEpoch;
        if (data.epochStartBlock !== undefined) this.epochStartBlock = data.epochStartBlock;
        if (data.epochStartTime !== undefined) this.epochStartTime = data.epochStartTime;

        if (data.stakes) {
            this.stakes.clear();
            data.stakes.forEach((s: StakeInfo) => this.stakes.set(s.address, s));
        }
        if (data.validators) {
            this.validators.clear();
            data.validators.forEach((v: ValidatorInfo) => this.validators.set(v.address, v));
        }
        if (data.delegations) {
            this.delegations.clear();
            Object.entries(data.delegations).forEach(([addr, dels]) =>
                this.delegations.set(addr, dels as Delegation[])
            );
        }
        if (data.validatorDelegations) {
            this.validatorDelegations.clear();
            Object.entries(data.validatorDelegations).forEach(([addr, amount]) =>
                this.validatorDelegations.set(addr, amount as number)
            );
        }
        if (data.pendingStakes) {
            this.pendingStakes.clear();
            data.pendingStakes.forEach((p: PendingStake) => this.pendingStakes.set(p.address, p));
        }
        if (data.pendingDelegations) {
            this.pendingDelegations = data.pendingDelegations;
        }
        if (data.pendingUnstakes) {
            this.pendingUnstakes.clear();
            Object.entries(data.pendingUnstakes).forEach(([addr, reqs]) =>
                this.pendingUnstakes.set(addr, reqs as UnstakeRequest[])
            );
        }
    }

    /**
     * Clear all staking state (for rebuild from chain)
     */
    clearAll(): void {
        this.stakes.clear();
        this.validators.clear();
        this.delegations.clear();
        this.validatorDelegations.clear();
        this.pendingStakes.clear();
        this.pendingDelegations = [];
        this.pendingUnstakes.clear();
        this.currentEpoch = 0;
        this.epochStartBlock = 0;
        this.epochStartTime = Date.now();
        logger.debug('Cleared all staking state for rebuild');
    }

    /**
     * Rebuild staking state from blockchain transactions
     * This is the ONLY source of truth for staking state
     */
    rebuildFromChain(chain: { transactions: { type?: string; fromAddress: string | null; toAddress: string; amount: number; data?: string }[] }[]): void {
        this.clearAll();

        let stakeTxCount = 0;
        let delegateTxCount = 0;

        for (const block of chain) {
            for (const tx of block.transactions) {
                if (!tx.type) continue;  // Skip legacy transactions

                if (tx.type === 'STAKE' && tx.fromAddress) {
                    // Apply stake: fromAddress stakes amount
                    this.applyStakeFromTx(tx.fromAddress, tx.amount);
                    stakeTxCount++;
                } else if (tx.type === 'UNSTAKE' && tx.fromAddress) {
                    // Apply unstake: fromAddress unstakes amount
                    this.applyUnstakeFromTx(tx.fromAddress, tx.amount);
                } else if (tx.type === 'DELEGATE' && tx.fromAddress && tx.data) {
                    // Apply delegation: fromAddress delegates amount to validator (in data)
                    this.applyDelegateFromTx(tx.fromAddress, tx.data, tx.amount);
                    delegateTxCount++;
                } else if (tx.type === 'UNDELEGATE' && tx.fromAddress && tx.data) {
                    // Apply undelegation: fromAddress undelegates amount from validator
                    this.applyUndelegateFromTx(tx.fromAddress, tx.data, tx.amount);
                }
            }
        }

        logger.info(`Rebuilt staking state: ${stakeTxCount} stakes, ${delegateTxCount} delegations`);
    }

    /**
     * Apply stake from transaction (internal, no validation)
     */
    applyStakeFromTx(address: string, amount: number): void {
        const existing = this.stakes.get(address);
        if (existing) {
            existing.amount += amount;
        } else {
            this.stakes.set(address, {
                address,
                amount,
                stakedAt: Date.now(),
                lastReward: Date.now(),
                epochStaked: this.currentEpoch
            });
        }
        this.updateValidator(address);
    }

    /**
     * Apply unstake from transaction (internal)
     */
    applyUnstakeFromTx(address: string, amount: number): void {
        const existing = this.stakes.get(address);
        if (existing) {
            existing.amount = Math.max(0, existing.amount - amount);
            if (existing.amount === 0) {
                this.stakes.delete(address);
                this.validators.delete(address);
            } else {
                this.updateValidator(address);
            }
        }
    }

    /**
     * Apply delegation from transaction (internal)
     */
    applyDelegateFromTx(delegator: string, validator: string, amount: number): void {
        const delegation: Delegation = {
            delegator,
            validator,
            amount,
            delegatedAt: Date.now(),
            epochDelegated: this.currentEpoch
        };

        const existing = this.delegations.get(delegator) || [];
        const existingDel = existing.find(d => d.validator === validator);
        if (existingDel) {
            existingDel.amount += amount;
        } else {
            existing.push(delegation);
        }
        this.delegations.set(delegator, existing);

        // Update validator delegated stake
        const currentDel = this.validatorDelegations.get(validator) || 0;
        this.validatorDelegations.set(validator, currentDel + amount);
        this.updateValidator(validator);
    }

    /**
     * Apply undelegation from transaction (internal)
     */
    applyUndelegateFromTx(delegator: string, validator: string, amount: number): void {
        const delegations = this.delegations.get(delegator);
        if (delegations) {
            const del = delegations.find(d => d.validator === validator);
            if (del) {
                del.amount = Math.max(0, del.amount - amount);
                if (del.amount === 0) {
                    this.delegations.set(delegator, delegations.filter(d => d.validator !== validator));
                }
            }
        }

        const currentDel = this.validatorDelegations.get(validator) || 0;
        this.validatorDelegations.set(validator, Math.max(0, currentDel - amount));
        this.updateValidator(validator);
    }

    // ========== GENESIS VALIDATORS ==========

    /**
     * Load genesis validators (bypass pending queue, active from block 0)
     * Called once during blockchain initialization
     */
    loadGenesisValidators(validators: GenesisValidator[]): void {
        for (const gv of validators) {
            // Create stake entry
            this.stakes.set(gv.operatorAddress, {
                address: gv.operatorAddress,
                amount: gv.power,
                stakedAt: 0,  // Genesis time
                lastReward: 0,
                epochStaked: 0  // Epoch 0
            });

            // Create validator entry (immediately active)
            this.validators.set(gv.operatorAddress, {
                address: gv.operatorAddress,
                stake: gv.power,
                delegatedStake: 0,
                commission: DEFAULT_COMMISSION,
                blocksCreated: 0,
                totalRewards: 0,
                slashCount: 0,
                isActive: true,  // Active immediately
                isJailed: false,
                jailedUntilEpoch: 0,
                jailCount: 0
            });

            this.log.info(`🌱 Genesis validator loaded: ${gv.operatorAddress.slice(0, 12)}... (power: ${gv.power})`);
        }
    }

    /**
     * Get genesis validators count
     */
    getGenesisValidatorCount(): number {
        // Genesis validators have epochStaked = 0
        return Array.from(this.stakes.values()).filter(s => s.epochStaked === 0).length;
    }
}

export const stakingPool = new StakingPool();
