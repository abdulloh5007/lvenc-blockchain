import { logger } from '../../protocol/utils/logger.js';
import { sha256 } from '../../protocol/utils/crypto.js';
import { chainParams } from '../../protocol/params/index.js';
import { config } from '../../node/config.js';
import { nonceManager } from '../../protocol/security/nonce-manager.js';
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

// Per PoS Protocol Spec v2: slashing detected at current block, applied at epoch boundary
export interface PendingSlash {
    address: string;
    reason: string;
    slashPercent: number;
    epochEffective: number;
    detectedAt: number;
}

export interface ValidatorInfo {
    address: string;
    stake: number;
    delegatedStake: number;
    commission: number; // 0-100% (default from chainParams)
    blocksCreated: number;
    totalRewards: number;
    slashCount: number;
    isActive: boolean;
    // Jailing status
    isJailed: boolean;
    jailedUntilEpoch: number;  // Epoch when jail ends (0 = not jailed)
    jailCount: number;          // Total times jailed
    // Rewards system (Part 3: Industry Standard)
    autoCompound: boolean;      // Auto-restake rewards into stake
    customCommission?: number;  // Custom commission (overrides default)
    totalEarned: number;        // Lifetime earnings tracking
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
const DOWNTIME_SLASH_PERCENT = chainParams.staking.downtimeSlashPercent;
const UNBONDING_EPOCHS = chainParams.staking.unbondingEpochs;
const JAIL_DURATION_EPOCHS = chainParams.staking.jailDurationEpochs;
const MAX_JAIL_COUNT = chainParams.staking.maxJailCount;
const MIN_ACTIVE_VALIDATORS = chainParams.staking.minActiveValidators;
const MIN_SLASH_AMOUNT = chainParams.staking.minSlashAmount;  // Minimum slash penalty

export class StakingPool {
    private stakes: Map<string, StakeInfo> = new Map();
    private delegations: Map<string, Delegation[]> = new Map(); // delegator -> delegations
    private validatorDelegations: Map<string, number> = new Map(); // validator -> total delegated
    private pendingStakes: Map<string, PendingStake> = new Map();
    private pendingDelegations: PendingDelegation[] = [];
    private pendingUnstakes: Map<string, UnstakeRequest[]> = new Map();
    private pendingSlashes: Map<string, PendingSlash[]> = new Map(); // Slashes applied at epoch boundary
    private validators: Map<string, ValidatorInfo> = new Map();
    private genesisValidators: GenesisValidator[] = [];  // Stored for rebuild

    // DOUBLE-STAKE FIX: Track processed TX IDs to prevent duplicate application
    private processedTxIds: Set<string> = new Set();

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

    /**
     * Simulate post-epoch validator set for liveness checking.
     * Returns projected active state of each validator after epoch transition.
     */
    private simulatePostEpochValidators(): { address: string; wouldBeActive: boolean }[] {
        const result: { address: string; wouldBeActive: boolean }[] = [];

        for (const [address, validator] of this.validators) {
            let stake = this.stakes.get(address)?.amount || 0;

            // Simulate pending stake additions
            const pendingStake = this.pendingStakes.get(address);
            if (pendingStake && pendingStake.epochEffective <= this.currentEpoch + 1) {
                stake += pendingStake.amount;
            }

            // Simulate pending slashes
            const pendingSlash = this.pendingSlashes.get(address);
            if (pendingSlash) {
                for (const s of pendingSlash) {
                    if (s.epochEffective <= this.currentEpoch + 1) {
                        stake -= Math.floor(stake * (s.slashPercent / 100));
                    }
                }
            }

            // Would be active if stake >= MIN and not permanently jailed
            const wouldBeUnjailed = !validator.isJailed ||
                (validator.jailedUntilEpoch !== Number.MAX_SAFE_INTEGER &&
                    validator.jailedUntilEpoch <= this.currentEpoch + 1);
            const wouldBeActive = stake >= MIN_STAKE && wouldBeUnjailed;

            result.push({ address, wouldBeActive });
        }

        return result;
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

        // Process pending slashes (per PoS Protocol Spec v2: applied at epoch boundary)
        for (const [address, slashes] of this.pendingSlashes) {
            const applicable = slashes.filter(s => s.epochEffective <= this.currentEpoch);
            const remaining = slashes.filter(s => s.epochEffective > this.currentEpoch);

            for (const slash of applicable) {
                this.applySlash(address, slash);
            }

            if (remaining.length === 0) {
                this.pendingSlashes.delete(address);
            } else {
                this.pendingSlashes.set(address, remaining);
            }
        }

        this.log.info(`🔄 Epoch transition: ${this.currentEpoch - 1} → ${this.currentEpoch}`);
    }

    // ========== STAKING ==========

    /**
     * Queue stake for activation at next epoch boundary.
     * Per Protocol Invariant INV-02/03: validator set changes ONLY at epoch boundaries.
     * Bootstrap is handled by genesis validators defined in genesis.json.
     */
    stake(address: string, amount: number): boolean {
        if (amount < MIN_STAKE) {
            this.log.warn(`Stake too low: ${amount} < ${MIN_STAKE}`);
            return false;
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

        // LIVENESS PROTECTION: Would this unstake deactivate a validator?
        const wouldDeactivate = (stake.amount - amount) < MIN_STAKE;
        if (wouldDeactivate) {
            // Simulate post-epoch to check if we'd violate liveness
            const postEpochActive = this.simulatePostEpochValidators()
                .filter(v => v.wouldBeActive && v.address !== address).length;

            if (postEpochActive < MIN_ACTIVE_VALIDATORS) {
                this.log.warn(`🛡️ LIVENESS: Cannot unstake - would leave ${postEpochActive} validators (min: ${MIN_ACTIVE_VALIDATORS})`);
                return null;
            }
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

        // Use custom commission if set, otherwise use default
        const commission = validatorInfo.customCommission ?? validatorInfo.commission ?? DEFAULT_COMMISSION;
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

        // Track both current rewards and lifetime earnings
        validatorInfo.totalRewards += validatorReward;
        validatorInfo.totalEarned += validatorReward;  // Lifetime tracking
        this.validators.set(validator, validatorInfo);

        return { validator: validatorReward, delegators: delegatorRewards };
    }

    /**
     * Set custom commission rate for a validator (0-100%)
     */
    setCommission(validatorAddress: string, commission: number): boolean {
        if (commission < 0 || commission > 100) {
            this.log.warn(`Invalid commission: ${commission}%. Must be 0-100.`);
            return false;
        }

        const validator = this.validators.get(validatorAddress);
        if (!validator) {
            this.log.warn(`Validator not found: ${validatorAddress.slice(0, 12)}...`);
            return false;
        }

        validator.customCommission = commission;
        this.validators.set(validatorAddress, validator);
        this.log.info(`💰 Commission updated: ${validatorAddress.slice(0, 12)}... → ${commission}%`);
        return true;
    }

    /**
     * Toggle auto-compound for a validator
     */
    setAutoCompound(validatorAddress: string, enabled: boolean): boolean {
        const validator = this.validators.get(validatorAddress);
        if (!validator) {
            this.log.warn(`Validator not found: ${validatorAddress.slice(0, 12)}...`);
            return false;
        }

        validator.autoCompound = enabled;
        this.validators.set(validatorAddress, validator);
        this.log.info(`🔄 Auto-compound ${enabled ? 'enabled' : 'disabled'}: ${validatorAddress.slice(0, 12)}...`);
        return true;
    }

    /**
     * Calculate network APY based on current parameters
     * APY = (annual_rewards / total_staked) * 100
     */
    getNetworkAPY(): { baseAPY: number; effectiveAPY: number; blocksPerYear: number; totalStaked: number } {
        const blocksPerYear = (365 * 24 * 60 * 60 * 1000) / chainParams.slotDuration;  // ~1,051,200 blocks
        const currentReward = 10;  // 10 LVE per block (could be dynamic)
        const annualRewards = blocksPerYear * currentReward;

        const totalStaked = this.getTotalStaked() + this.getTotalDelegated();
        const baseAPY = totalStaked > 0 ? (annualRewards / totalStaked) * 100 : 0;

        // Average commission across validators
        const validators = this.getValidators();
        const avgCommission = validators.length > 0
            ? validators.reduce((sum, v) => sum + (v.commission || DEFAULT_COMMISSION), 0) / validators.length
            : DEFAULT_COMMISSION;

        const effectiveAPY = baseAPY * (1 - avgCommission / 100);

        return {
            baseAPY: Math.round(baseAPY * 100) / 100,
            effectiveAPY: Math.round(effectiveAPY * 100) / 100,
            blocksPerYear: Math.round(blocksPerYear),
            totalStaked
        };
    }

    // ========== SLASHING ==========

    /**
     * Queue a slash for application at next epoch boundary.
     * Per PoS Protocol Spec v2: slashing detected at current block, applied at next epoch.
     * Jailing is immediate (validator removed from selection), stake reduction is deferred.
     */
    slash(address: string, reason: string): number {
        const stake = this.stakes.get(address);
        if (!stake) return 0;

        const slashAmount = Math.floor(stake.amount * (SLASH_PERCENT / 100));

        // Queue slash for epoch boundary
        const pendingSlash: PendingSlash = {
            address,
            reason,
            slashPercent: SLASH_PERCENT,
            epochEffective: this.currentEpoch + 1,
            detectedAt: Date.now()
        };

        const existing = this.pendingSlashes.get(address) || [];
        existing.push(pendingSlash);
        this.pendingSlashes.set(address, existing);

        const validator = this.validators.get(address);
        if (validator) {
            validator.slashCount++;
            this.validators.set(address, validator);
            // Jail immediately to prevent block production (even before slash applied)
            this.jailValidator(address, reason);
        }

        this.log.warn(`⚠️ Slash queued: ${slashAmount} LVE from ${address.slice(0, 10)}... (effective epoch ${this.currentEpoch + 1})`);
        return slashAmount;
    }

    /**
     * Actually apply a slash (called during epoch transition)
     * Now enforces MIN_SLASH_AMOUNT for meaningful penalties
     * @internal
     */
    private applySlash(address: string, pendingSlash: PendingSlash): void {
        const stake = this.stakes.get(address);
        if (!stake) return;

        // Calculate slash with minimum enforcement
        const percentSlash = Math.floor(stake.amount * (pendingSlash.slashPercent / 100));
        const slashAmount = Math.max(percentSlash, MIN_SLASH_AMOUNT);

        // Don't slash more than available stake
        const actualSlash = Math.min(slashAmount, stake.amount);

        stake.amount -= actualSlash;
        this.stakes.set(address, stake);
        this.updateValidator(address);

        this.log.warn(`🔪 Slash applied: ${actualSlash} LVE from ${address.slice(0, 10)}... (${pendingSlash.slashPercent}%, min=${MIN_SLASH_AMOUNT}) Reason: ${pendingSlash.reason}`);
    }

    /**
     * Slash for downtime (lighter penalty than double-sign)
     * Uses DOWNTIME_SLASH_PERCENT instead of full SLASH_PERCENT
     */
    slashForDowntime(address: string, reason: string): number {
        const stake = this.stakes.get(address);
        if (!stake) return 0;

        const slashAmount = Math.floor(stake.amount * (DOWNTIME_SLASH_PERCENT / 100));

        // Queue slash for epoch boundary with reduced percent
        const pendingSlash: PendingSlash = {
            address,
            reason,
            slashPercent: DOWNTIME_SLASH_PERCENT,
            epochEffective: this.currentEpoch + 1,
            detectedAt: Date.now()
        };

        const existing = this.pendingSlashes.get(address) || [];
        existing.push(pendingSlash);
        this.pendingSlashes.set(address, existing);

        const validator = this.validators.get(address);
        if (validator) {
            validator.slashCount++;
            this.validators.set(address, validator);
            // Jail immediately
            this.jailValidator(address, reason);
        }

        this.log.warn(`⏰ Downtime slash queued: ${slashAmount} LVE from ${address.slice(0, 10)}... (effective epoch ${this.currentEpoch + 1})`);
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
        const existing = this.validators.get(address);
        const oldStake = existing?.stake || 0;
        const newStake = stake?.amount || 0;
        const wasActive = existing?.isActive || false;

        if (!stake || stake.amount < MIN_STAKE) {
            if (existing) {
                existing.isActive = false;
                this.validators.set(address, existing);
                if (wasActive) {
                    this.log.warn(`📉 Validator ${address.slice(0, 12)}... deactivated (stake ${newStake}/${MIN_STAKE} LVE)`);
                }
            }
            return;
        }

        if (existing) {
            existing.stake = stake.amount;
            existing.isActive = true;
            this.validators.set(address, existing);

            // Log stake changes
            if (oldStake !== newStake) {
                this.log.info(`💰 Stake changed: ${address.slice(0, 12)}... ${oldStake} → ${newStake} LVE`);
            }
            if (!wasActive && existing.isActive) {
                this.log.info(`🎉 NEW ACTIVE VALIDATOR: ${address.slice(0, 12)}... with ${newStake} LVE`);
            }
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
                autoCompound: false,  // Default: don't auto-compound
                totalEarned: 0,       // Lifetime earnings
            });
            this.log.info(`🎉 NEW ACTIVE VALIDATOR: ${address.slice(0, 12)}... with ${newStake} LVE`);
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
        this.processedTxIds.clear();  // DOUBLE-STAKE FIX: Clear processed TX tracking
        this.currentEpoch = 0;
        this.epochStartBlock = 0;
        this.epochStartTime = Date.now();
        logger.debug('Cleared all staking state for rebuild');
    }

    /**
     * Rebuild staking state from blockchain transactions
     * This is the ONLY source of truth for staking state
     * Genesis validators are automatically reloaded from stored genesisValidators
     * SECURITY: Also rebuilds NonceManager state from chain transactions
     */
    rebuildFromChain(chain: {
        transactions: { type?: string; fromAddress: string | null; toAddress: string; amount: number; data?: string; id?: string; nonce?: number }[];
        validator?: string;  // PoS block validator
    }[]): void {
        // Store genesis validators before clear
        const savedGenesisValidators = this.genesisValidators;

        this.clearAll();

        // Reload genesis validators (they have no on-chain STAKE tx)
        if (savedGenesisValidators.length > 0) {
            this.loadGenesisValidators(savedGenesisValidators);
        }

        let stakeTxCount = 0;
        let delegateTxCount = 0;
        const blocksCreatedMap = new Map<string, number>();

        // SECURITY FIX: Track nonces per address for NonceManager rebuild
        const addressNonces = new Map<string, number>();

        for (const block of chain) {
            // Count blocks created per validator (skip genesis block index 0)
            if (block.validator) {
                const current = blocksCreatedMap.get(block.validator) || 0;
                blocksCreatedMap.set(block.validator, current + 1);
            }

            for (const tx of block.transactions) {
                // SECURITY FIX: Track highest nonce per address
                if (tx.fromAddress && tx.nonce !== undefined) {
                    const currentNonce = addressNonces.get(tx.fromAddress) ?? -1;
                    if (tx.nonce > currentNonce) {
                        addressNonces.set(tx.fromAddress, tx.nonce);
                    }
                }

                if (!tx.type) continue;  // Skip legacy transactions

                if (tx.type === 'STAKE' && tx.fromAddress) {
                    // Apply stake: fromAddress stakes amount (pass tx.id for dedup)
                    this.applyStakeFromTx(tx.fromAddress, tx.amount, tx.id);
                    stakeTxCount++;
                } else if (tx.type === 'UNSTAKE' && tx.fromAddress) {
                    // Apply unstake: fromAddress unstakes amount
                    this.applyUnstakeFromTx(tx.fromAddress, tx.amount, tx.id);
                } else if (tx.type === 'DELEGATE' && tx.fromAddress && tx.data) {
                    // Apply delegation: fromAddress delegates amount to validator (in data)
                    this.applyDelegateFromTx(tx.fromAddress, tx.data, tx.amount, tx.id);
                    delegateTxCount++;
                } else if (tx.type === 'UNDELEGATE' && tx.fromAddress && tx.data) {
                    // Apply undelegation: fromAddress undelegates amount from validator
                    this.applyUndelegateFromTx(tx.fromAddress, tx.data, tx.amount, tx.id);
                } else if (tx.type === 'COMMISSION' && tx.fromAddress) {
                    // Apply commission change: amount = new commission percentage
                    this.setCommission(tx.fromAddress, tx.amount);
                }
            }
        }

        // Apply blocksCreated to validators
        for (const [validatorAddress, count] of blocksCreatedMap) {
            const validator = this.validators.get(validatorAddress);
            if (validator) {
                validator.blocksCreated = count;
                this.validators.set(validatorAddress, validator);
            }
        }

        // SECURITY FIX: Rebuild NonceManager from chain state
        if (addressNonces.size > 0) {
            nonceManager.loadFromBlockchain(addressNonces);
            logger.info(`🔒 SECURITY: Rebuilt nonces for ${addressNonces.size} addresses from chain`);
        }

        const genesisCount = savedGenesisValidators.length;
        const totalBlocks = Array.from(blocksCreatedMap.values()).reduce((a, b) => a + b, 0);
        logger.info(`Rebuilt staking state: ${genesisCount} genesis, ${stakeTxCount} stakes, ${delegateTxCount} delegations, ${totalBlocks} blocks counted`);
    }

    /**
     * Apply stake from transaction (internal, no validation)
     * @param txId Optional transaction ID for deduplication (DOUBLE-STAKE FIX)
     * @returns true if applied, false if duplicate
     */
    applyStakeFromTx(address: string, amount: number, txId?: string): boolean {
        // DOUBLE-STAKE FIX: Skip if this TX was already processed
        if (txId) {
            if (this.processedTxIds.has(txId)) {
                this.log.debug(`⏭️ Skipping duplicate stake TX: ${txId.slice(0, 12)}...`);
                return false;
            }
            this.processedTxIds.add(txId);
        }

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
        return true;
    }

    /**
     * Apply unstake from transaction (internal)
     * @param txId Optional transaction ID for deduplication
     * @returns true if applied, false if duplicate
     */
    applyUnstakeFromTx(address: string, amount: number, txId?: string): boolean {
        // DOUBLE-STAKE FIX: Skip if this TX was already processed
        if (txId && this.processedTxIds.has(txId)) {
            this.log.debug(`⏭️ Skipping duplicate unstake TX: ${txId.slice(0, 12)}...`);
            return false;
        }
        if (txId) this.processedTxIds.add(txId);

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
        return true;
    }

    /**
     * Apply delegation from transaction (internal)
     * @param txId Optional transaction ID for deduplication
     * @returns true if applied, false if duplicate
     */
    applyDelegateFromTx(delegator: string, validator: string, amount: number, txId?: string): boolean {
        // DOUBLE-STAKE FIX: Skip if this TX was already processed
        if (txId && this.processedTxIds.has(txId)) {
            this.log.debug(`⏭️ Skipping duplicate delegate TX: ${txId.slice(0, 12)}...`);
            return false;
        }
        if (txId) this.processedTxIds.add(txId);

        // Check concentration limit - prevent one validator from having >33% of total stake
        const totalNetwork = this.getTotalStaked() + this.getTotalDelegated();
        if (totalNetwork > 0) {
            const validatorInfo = this.validators.get(validator);
            const validatorWeight = (validatorInfo?.stake || 0) +
                (this.validatorDelegations.get(validator) || 0) +
                amount;
            const concentration = (validatorWeight / totalNetwork) * 100;

            if (concentration > config.staking.maxConcentration) {
                this.log.warn(`⚠️ Delegation rejected: would exceed ${config.staking.maxConcentration}% concentration limit`);
                throw new Error(`Delegation would exceed ${config.staking.maxConcentration}% concentration limit`);
            }
        }

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
        return true;
    }

    /**
     * Apply undelegation from transaction (internal)
     * @param txId Optional transaction ID for deduplication
     * @returns true if applied, false if duplicate
     */
    applyUndelegateFromTx(delegator: string, validator: string, amount: number, txId?: string): boolean {
        // DOUBLE-STAKE FIX: Skip if this TX was already processed
        if (txId && this.processedTxIds.has(txId)) {
            this.log.debug(`⏭️ Skipping duplicate undelegate TX: ${txId.slice(0, 12)}...`);
            return false;
        }
        if (txId) this.processedTxIds.add(txId);

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
        return true;
    }

    // ========== GENESIS VALIDATORS ==========

    /**
     * Load genesis validators (bypass pending queue, active from block 0)
     * Called once during blockchain initialization
     * Also stores them for automatic reload on rebuildFromChain
     */
    loadGenesisValidators(validators: GenesisValidator[]): void {
        // Store for later rebuild
        this.genesisValidators = validators;

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
                jailCount: 0,
                autoCompound: false,  // Default: don't auto-compound
                totalEarned: 0,       // Lifetime earnings
            });

            this.log.info(`🌱 Genesis validator loaded: ${gv.operatorAddress.slice(0, 12)}... (power: ${gv.power})`);
            this.log.info(`💰 Stake changed: ${gv.operatorAddress.slice(0, 12)}... 0 → ${gv.power.toLocaleString()} LVE`);
            this.log.info(`🎉 NEW ACTIVE VALIDATOR: ${gv.operatorAddress.slice(0, 12)}... with ${gv.power} LVE`);
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
