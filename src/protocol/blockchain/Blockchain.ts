import * as ed from '@noble/ed25519';
import { Block, BlockData } from './Block.js';
import { Transaction, TransactionData } from './Transaction.js';
import { config } from '../../node/config.js';
import { logger } from '../utils/logger.js';
import { chainParams } from '../params/index.js';
import { SafeMath, acquireTxLock, releaseTxLock, addCheckpoint } from '../security/index.js';
import { stakingPool, StakingPool } from '../../runtime/staking/index.js';

export interface BlockchainData {
    chain: BlockData[];
    pendingTransactions: TransactionData[];
}

export class Blockchain {
    public chain: Block[];
    public pendingTransactions: Transaction[];
    public lastFinalizedIndex: number;
    private balanceCache: Map<string, number>;
    private static readonly FINALITY_DEPTH = 32;
    private static readonly INITIAL_SYNC_DELAY = 10000;
    private startTime: number;
    private isSynced: boolean = false;

    // Events
    public onBlockMined?: (block: Block) => void;
    public onTransactionAdded?: (tx: Transaction) => void;
    public onStakingChange?: (address: string, type: 'STAKE' | 'UNSTAKE' | 'DELEGATE' | 'UNDELEGATE' | 'COMMISSION', amount: number) => void;

    // Supply Tracking (TON-like infinite supply)
    private totalSupply: number = 0;

    constructor() {
        this.pendingTransactions = [];
        this.balanceCache = new Map();
        this.lastFinalizedIndex = 0;
        this.chain = [];
        this.startTime = Date.now();
        // Initial supply from config (Genesis)
        this.totalSupply = config.blockchain.genesisAmount;
    }

    /**
     * Initialize blockchain with genesis block
     */
    initialize(faucetAddress: string): void {
        if (this.chain.length === 0) {
            this.totalSupply = config.blockchain.genesisAmount;
            const genesis = Block.createGenesisBlock(
                config.blockchain.genesisAmount,
                faucetAddress,
                config.genesis?.timestamp || 0,
                config.genesis?.faucetPublicKey
            );
            this.chain.push(genesis);
            this.updateBalanceCache();
            logger.info(`🌍 Genesis block created with ${config.blockchain.genesisAmount} ${config.blockchain.coinSymbol}`);
        }
    }

    /**
     * Load blockchain from data
     */
    loadFromData(data: BlockchainData): void {
        this.chain = data.chain.map(blockData => Block.fromJSON(blockData));

        // Recalculate Total Supply
        this.totalSupply = config.blockchain.genesisAmount;

        // Accurate emulation of supply based on Epochs
        // We iterate through blocks to find Epoch Boundaries and re-apply inflation?
        // Or strictly rely on what's implicitly in the chain (no, chain stores full distribution?)
        // In the updated createPoSBlock, we perform `this.totalSupply += mintReward`.
        // This state is transient if not persisted.
        // Ideally, TotalSupply should be persisted in 'BlockchainData' or derived.
        // Plan.md says "Supply Manager ... track total supply".
        // Blockchain.ts IS acting as the Supply Manager here.
        // For recovery, we can iterate:
        const epochDuration = config.staking.epochDuration;
        const blocksPerYear = 1051200; // Fixed approx
        const annualRate = 0.006;

        for (const block of this.chain) {
            // Re-apply epoch inflation logic
            if (block.index > 0 && block.index % epochDuration === 0) {
                const annualInflation = this.totalSupply * annualRate;
                const epochsPerYear = blocksPerYear / epochDuration;
                const mintReward = annualInflation / epochsPerYear;
                this.totalSupply += mintReward;
            }
        }

        // Filter out pending transactions that are already in the chain
        const chainTxIds = new Set<string>();
        for (const block of this.chain) {
            for (const tx of block.transactions) {
                chainTxIds.add(tx.id);
            }
        }

        const pendingTxs = data.pendingTransactions.map(tx => Transaction.fromJSON(tx));
        this.pendingTransactions = pendingTxs.filter(tx => !chainTxIds.has(tx.id));

        this.updateBalanceCache();
        stakingPool.rebuildFromChain(this.chain);
        logger.info(`📦 Loaded ${this.chain.length} blocks from storage. Supply: ${this.totalSupply.toLocaleString()}`);
    }

    /**
     * Get the latest block
     */
    getLatestBlock(): Block {
        return this.chain[this.chain.length - 1];
    }

    /**
     * Get block by hash
     */
    getBlockByHash(hash: string): Block | undefined {
        return this.chain.find(block => block.hash === hash);
    }

    /**
     * Get block by index
     */
    getBlockByIndex(index: number): Block | undefined {
        return this.chain[index];
    }

    /**
     * Check if node is ready to produce blocks
     */
    isReadyToProduceBlocks(): boolean {
        const elapsed = Date.now() - this.startTime;
        if (elapsed < Blockchain.INITIAL_SYNC_DELAY) {
            return false;
        }
        return this.isSynced;
    }

    /**
     * Mark blockchain as synced
     */
    markAsSynced(): void {
        if (!this.isSynced) {
            this.isSynced = true;
            logger.info('✅ Blockchain synced and ready to produce blocks');
        }
    }

    /**
     * Check if blockchain is synced
     */
    getIsSynced(): boolean {
        return this.isSynced;
    }

    /**
     * Apply staking changes from a single block in real-time
     */
    applyBlockStakingChanges(block: Block): void {
        // Increment block count for validator (Real-time update)
        if (block.validator) {
            stakingPool.recordBlockCreated(block.validator);
        }

        for (const tx of block.transactions) {
            if (tx.type === 'STAKE' && tx.fromAddress) {
                const applied = stakingPool.applyStakeFromTx(tx.fromAddress, tx.amount, tx.id);
                if (applied) this.onStakingChange?.(tx.fromAddress, 'STAKE', tx.amount);
            } else if (tx.type === 'UNSTAKE' && tx.fromAddress) {
                const applied = stakingPool.applyUnstakeFromTx(tx.fromAddress, tx.amount, tx.id);
                if (applied) this.onStakingChange?.(tx.fromAddress, 'UNSTAKE', tx.amount);
            } else if (tx.type === 'DELEGATE' && tx.fromAddress && tx.data) {
                const applied = stakingPool.applyDelegateFromTx(tx.fromAddress, tx.data, tx.amount, tx.id);
                if (applied) this.onStakingChange?.(tx.fromAddress, 'DELEGATE', tx.amount);
            } else if (tx.type === 'UNDELEGATE' && tx.fromAddress && tx.data) {
                const applied = stakingPool.applyUndelegateFromTx(tx.fromAddress, tx.data, tx.amount, tx.id);
                if (applied) this.onStakingChange?.(tx.fromAddress, 'UNDELEGATE', tx.amount);
            } else if (tx.type === 'COMMISSION' && tx.fromAddress) {
                const applied = stakingPool.setCommission(tx.fromAddress, tx.amount);
                if (applied) this.onStakingChange?.(tx.fromAddress, 'COMMISSION', tx.amount);
            }
        }
    }

    /**
     * Add a transaction to the pending pool
     */
    addTransaction(transaction: Transaction): boolean {
        if (this.pendingTransactions.length >= config.blockchain.maxPendingTx) {
            throw new Error(`Transaction pool is full (max ${config.blockchain.maxPendingTx})`);
        }
        const genesisAddress = this.chain[0]?.transactions[0]?.toAddress;
        const isFaucetTx = transaction.fromAddress === genesisAddress;
        const isStakingTx = transaction.isStakingTx();

        if (transaction.fromAddress !== null && transaction.fee < config.blockchain.minFee && !isFaucetTx && !isStakingTx) {
            throw new Error(`Minimum fee is ${config.blockchain.minFee} ${config.blockchain.coinSymbol}`);
        }
        if (!transaction.fromAddress && !transaction.toAddress) {
            throw new Error('Transaction must have from or to address');
        }
        if (!transaction.isValid()) {
            throw new Error('Cannot add invalid transaction');
        }

        const existingById = this.pendingTransactions.find(tx => tx.id === transaction.id);
        if (existingById) return false;

        if (transaction.type === 'STAKE' && transaction.fromAddress) {
            const existingStake = this.pendingTransactions.find(tx => tx.type === 'STAKE' && tx.fromAddress === transaction.fromAddress);
            if (existingStake) throw new Error('STAKE transaction already pending for this address.');
        }

        if (transaction.fromAddress) {
            if (!acquireTxLock(transaction.fromAddress)) throw new Error('Transaction in progress for this address');
            try {
                const availableBalance = this.getAvailableBalance(transaction.fromAddress);
                const totalCost = transaction.getTotalCost();
                if (availableBalance < totalCost) throw new Error(`Insufficient balance.`);
                this.pendingTransactions.push(transaction);
            } finally {
                releaseTxLock(transaction.fromAddress);
            }
        } else {
            this.pendingTransactions.push(transaction);
        }
        if (this.onTransactionAdded) this.onTransactionAdded(transaction);
        return true;
    }

    /**
     * Get recommended fee based on network load
     */
    getRecommendedFee(): { min: number, recommended: number, high: number } {
        const baseFee = config.blockchain.minFee;
        const loadFactor = this.pendingTransactions.length / config.blockchain.maxPendingTx;

        let multiplier = 1;
        if (loadFactor > 0.8) multiplier = 2;
        else if (loadFactor > 0.5) multiplier = 1.5;

        return {
            min: baseFee,
            recommended: baseFee * multiplier,
            high: baseFee * multiplier * 1.5
        };
    }

    /**
     * Create PoS block
     * MINTING RULE: Only at Epoch Boundaries (Every 100 blocks)
     */
    createPoSBlock(validatorAddress: string, signFn: (hash: string) => string): Block {
        const sortedByFee = [...this.pendingTransactions].sort((a, b) => b.fee - a.fee);
        const txToInclude = sortedByFee.slice(0, config.blockchain.maxTxPerBlock);
        const remainingTx = sortedByFee.slice(config.blockchain.maxTxPerBlock);

        const blockIndex = this.chain.length;
        const epochDuration = config.staking.epochDuration; // e.g. 100
        const isEpochBoundary = blockIndex > 0 && (blockIndex % epochDuration === 0);

        let mintReward = 0;
        // Apply Epoch Inflation
        if (isEpochBoundary) {
            // Inflation = (TotalSupply * AnnualRate) / EpochsPerYear
            // EpochsPerYear = BlocksPerYear / EpochDuration
            const annualRate = config.economics.inflationRate;
            const annualInflation = this.totalSupply * annualRate;
            const epochsPerYear = 1051200 / epochDuration;
            mintReward = annualInflation / epochsPerYear;

            this.totalSupply += mintReward;
            logger.info(`💸 Epoch Inflation Minted: ${mintReward.toFixed(2)} LVE at block ${blockIndex}`);
        }

        const totalFees = txToInclude.reduce((sum, tx) => SafeMath.add(sum, tx.fee), 0);
        const totalReward = SafeMath.add(mintReward, totalFees);

        // Reward Tx goes to Validator (Validator then distributes via StakingPool if applicable)
        const rewardTx = new Transaction(null, validatorAddress, totalReward, 0);

        const block = new Block(
            blockIndex,
            Date.now(),
            [rewardTx, ...txToInclude],
            this.getLatestBlock().hash
        );
        block.signAsValidator(validatorAddress, signFn);
        this.chain.push(block);
        addCheckpoint(block.index, block.hash);
        this.pendingTransactions = remainingTx;
        this.updateBalanceCache();

        this.applyBlockStakingChanges(block);
        this.updateFinality();

        if (isEpochBoundary) {
            logger.info(`🔄 EPOCH FINALIZED at height ${blockIndex}. New Supply: ${this.totalSupply.toFixed(2)}`);
        }

        if (this.onBlockMined) {
            this.onBlockMined(block);
        }
        return block;
    }

    private updateFinality(): void {
        const newFinalized = this.chain.length - Blockchain.FINALITY_DEPTH;
        if (newFinalized > this.lastFinalizedIndex) {
            this.lastFinalizedIndex = newFinalized;
            logger.info(`🔒 Block #${newFinalized} finalized (irreversible)`);
        }
    }

    getLastFinalizedBlock(): Block | null {
        if (this.lastFinalizedIndex <= 0 || this.lastFinalizedIndex >= this.chain.length) return null;
        return this.chain[this.lastFinalizedIndex];
    }

    /**
     * Get TOTAL balance from blockchain (raw, not considering staking)
     */
    getTotalBalance(address: string): number {
        if (this.balanceCache.has(address)) return this.balanceCache.get(address)!;
        let balance = 0;
        for (const block of this.chain) {
            for (const tx of block.transactions) {
                if (tx.type === 'STAKE' || tx.type === 'UNSTAKE' || tx.type === 'DELEGATE' || tx.type === 'UNDELEGATE') continue;
                if (tx.fromAddress === address) balance -= tx.amount;
                if (tx.toAddress === address) balance += tx.amount;
            }
        }
        this.balanceCache.set(address, balance);
        return balance;
    }

    /**
     * Get AVAILABLE balance (total - staked - pendingStaked)
     */
    getBalance(address: string): number {
        const totalBalance = this.getTotalBalance(address);
        const stakedAmount = stakingPool.getStake(address);
        const pendingStake = stakingPool.getPendingStake(address);
        return Math.max(0, totalBalance - stakedAmount - pendingStake);
    }

    /**
     * Get available balance for spending
     */
    getAvailableBalance(address: string): number {
        const availableBalance = this.getBalance(address);
        let pendingOutgoing = 0;
        for (const tx of this.pendingTransactions) {
            if (tx.fromAddress === address) pendingOutgoing += tx.amount + tx.fee;
        }
        return Math.max(0, availableBalance - pendingOutgoing);
    }

    private updateBalanceCache(): void {
        this.balanceCache.clear();
    }

    /**
     * Get transaction history for an address
     */
    getTransactionHistory(address: string): Transaction[] {
        const transactions: Transaction[] = [];
        for (const block of this.chain) {
            for (const tx of block.transactions) {
                if (tx.fromAddress === address || tx.toAddress === address) transactions.push(tx);
            }
        }
        return transactions.sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * Get transaction by ID
     */
    getTransaction(id: string): { transaction: Transaction; block: Block } | null {
        for (const block of this.chain) {
            for (const tx of block.transactions) {
                if (tx.id === id) return { transaction: tx, block };
            }
        }
        const pending = this.pendingTransactions.find(tx => tx.id === id);
        if (pending) return { transaction: pending, block: null as unknown as Block };
        return null;
    }

    /**
     * Validate chain integrity
     */
    isChainValid(): boolean {
        for (let i = 1; i < this.chain.length; i++) {
            const currentBlock = this.chain[i];
            const previousBlock = this.chain[i - 1];
            if (currentBlock.hash !== currentBlock.calculateHash()) return false;
            if (currentBlock.previousHash !== previousBlock.hash) return false;
            if (!currentBlock.hasValidTransactions()) return false;
            // Additional PoS checks...
        }
        return true;
    }

    /**
     * SECURITY: Cryptographically verify a block signature
     */
    async validateNewBlock(block: Block, contextPool?: StakingPool): Promise<{ valid: boolean; error?: string }> {
        if (block.hash !== block.calculateHash()) return { valid: false, error: 'Invalid hash' };
        if (!block.hasValidTransactions()) return { valid: false, error: 'Invalid transactions' };

        if (block.validator && block.signature) {
            try {
                const signature = Buffer.from(block.signature, 'hex');
                const pool = contextPool || stakingPool;
                const validatorInfo = pool.getValidators().find(v => v.address === block.validator);

                if (!validatorInfo) return { valid: false, error: 'Unknown validator public key' };
                if (!validatorInfo.publicKey) return { valid: false, error: 'Validator public key not found' };

                const publicKey = Buffer.from(validatorInfo.publicKey, 'hex');
                const signingData = `${chainParams.chainId}:${block.index}:${block.hash}`;
                let isValid = await ed.verifyAsync(signature, Buffer.from(signingData), publicKey);
                if (!isValid) {
                    // Legacy fallback: some nodes may have signed raw hash bytes
                    isValid = await ed.verifyAsync(signature, Buffer.from(block.hash, 'hex'), publicKey);
                }

                if (!isValid) return { valid: false, error: 'Invalid cryptographic signature' };
                if (validatorInfo.isJailed) return { valid: false, error: 'Block signed by jailed validator' };

            } catch (err) {
                return { valid: false, error: `Signature verification failed` };
            }
        } else {
            // In pure PoS, unsigned blocks are invalid (except maybe Genesis which is special cased or pre-signed)
            // But wait, Genesis block in verifyIncomingChain check?
            if (block.index === 0) return { valid: true }; // Genesis is valid
            return { valid: false, error: 'Missing validator or signature' };
        }
        return { valid: true };
    }

    /**
     * STATEFUL REPLAY VERIFICATION
     */
    async verifyIncomingChain(chain: Block[]): Promise<boolean> {
        if (!chain || chain.length === 0) return false;
        const firstBlock = chain[0];
        if (firstBlock.index !== 0) return false;
        if (firstBlock.previousHash !== '0' && firstBlock.previousHash !== '0'.repeat(64)) {
            return false;
        }
        const localGenesis = this.chain[0];
        if (localGenesis && firstBlock.hash !== localGenesis.hash) {
            return false;
        }

        const sandboxPool = new StakingPool();
        sandboxPool.loadGenesisValidators(stakingPool.getGenesisValidators());

        for (const block of chain) {
            if (block.index === 0) continue;
            const result = await this.validateNewBlock(block, sandboxPool);
            if (!result.valid) return false;
            sandboxPool.applyBlockTransactions(block);
        }
        return true;
    }

    /**
     * Replace chain with a longer valid chain
     */
    replaceChain(newChain: Block[]): boolean {
        if (newChain.length <= this.chain.length) return false;

        const tempBlockchain = new Blockchain();
        tempBlockchain.chain = newChain;
        if (!tempBlockchain.isChainValid()) return false;

        this.chain = newChain;
        this.updateBalanceCache();
        stakingPool.rebuildFromChain(newChain);

        if (this.onStakingChange) {
            const allValidators = stakingPool.getAllValidators();
            for (const v of allValidators) {
                this.onStakingChange(v.address, 'STAKE', v.stake);
            }
        }
        return true;
    }

    /**
     * Get blockchain stats
     */
    getStats() {
        let totalTransactions = 0;
        let totalAmount = 0;
        for (const block of this.chain) {
            totalTransactions += block.transactions.length;
            for (const tx of block.transactions) {
                totalAmount += tx.amount;
            }
        }

        // Supply Info (TON-like)
        const epochDuration = config.staking.epochDuration;
        const annualInflation = this.totalSupply * 0.006;

        return {
            blocks: this.chain.length,
            transactions: totalTransactions,
            pendingTransactions: this.pendingTransactions.length,
            consensusType: 'pos' as const,
            latestBlockHash: this.getLatestBlock()?.hash || 'none',
            coinSymbol: config.blockchain.coinSymbol,
            totalSupply: this.totalSupply,
            inflationRate: '0.6% (Annual)',
            epochDuration,
            annualInflationEstimate: annualInflation
        };
    }

    /**
     * Convert to plain object for storage
     */
    toJSON(): BlockchainData {
        return {
            chain: this.chain.map(block => block.toJSON()),
            pendingTransactions: this.pendingTransactions.map(tx => tx.toJSON())
        };
    }
}
