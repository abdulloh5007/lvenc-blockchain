import { Block, BlockData } from './Block.js';
import { Transaction, TransactionData } from './Transaction.js';
import { config } from '../../node/config.js';
import { logger } from '../utils/logger.js';
import { SafeMath, acquireTxLock, releaseTxLock, validateTransaction, addCheckpoint, validateAgainstCheckpoint, validateBlockTimestamp } from '../security/index.js';
import { stakingPool } from '../../runtime/staking/index.js';
import { verifyBlockSignature } from './BlockSignature.js';

export interface BlockchainData {
    chain: BlockData[];
    pendingTransactions: TransactionData[];
    difficulty: number;
    validatorReward: number;
}

export class Blockchain {
    public chain: Block[];
    public pendingTransactions: Transaction[];
    public difficulty: number;
    public validatorReward: number;
    public lastFinalizedIndex: number;
    private balanceCache: Map<string, number>;
    private static readonly FINALITY_DEPTH = 32;
    public onBlockMined?: (block: Block) => void;
    public onTransactionAdded?: (tx: Transaction) => void;
    constructor() {
        this.difficulty = config.blockchain.difficulty;
        this.validatorReward = config.blockchain.validatorReward;
        this.pendingTransactions = [];
        this.balanceCache = new Map();
        this.lastFinalizedIndex = 0;
        this.chain = [];
    }

    /**
     * Initialize blockchain with genesis block
     */
    initialize(faucetAddress: string): void {
        if (this.chain.length === 0) {
            const genesis = Block.createGenesisBlock(
                config.blockchain.genesisAmount,
                faucetAddress,
                this.difficulty,
                config.genesis?.timestamp || 0
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
        this.pendingTransactions = data.pendingTransactions.map(tx => Transaction.fromJSON(tx));
        this.difficulty = data.difficulty;
        this.validatorReward = data.validatorReward;
        this.updateBalanceCache();

        // Rebuild staking state from chain transactions (on-chain staking)
        stakingPool.rebuildFromChain(this.chain);

        logger.info(`📦 Loaded ${this.chain.length} blocks from storage`);
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
     * Add a transaction to the pending pool
     */
    addTransaction(transaction: Transaction): boolean {
        if (this.pendingTransactions.length >= config.blockchain.maxPendingTx) {
            throw new Error(`Transaction pool is full (max ${config.blockchain.maxPendingTx})`);
        }
        const genesisAddress = this.chain[0]?.transactions[0]?.toAddress;
        const isFaucetTx = transaction.fromAddress === genesisAddress;
        const isStakingTx = transaction.isStakingTx();  // Staking tx = no fee

        if (transaction.fromAddress !== null && transaction.fee < config.blockchain.minFee && !isFaucetTx && !isStakingTx) {
            throw new Error(`Minimum fee is ${config.blockchain.minFee} ${config.blockchain.coinSymbol}`);
        }
        if (!transaction.fromAddress && !transaction.toAddress) {
            throw new Error('Transaction must have from or to address');
        }
        if (!transaction.isValid()) {
            throw new Error('Cannot add invalid transaction');
        }

        // Anti-double-stake: Prevent multiple STAKE transactions from same address in pending pool
        if (transaction.type === 'STAKE' && transaction.fromAddress) {
            const existingStake = this.pendingTransactions.find(
                tx => tx.type === 'STAKE' && tx.fromAddress === transaction.fromAddress
            );
            if (existingStake) {
                throw new Error('STAKE transaction already pending for this address. Wait for block confirmation.');
            }
        }

        if (transaction.fromAddress) {
            if (!acquireTxLock(transaction.fromAddress)) {
                throw new Error('Transaction in progress for this address');
            }
            try {
                const availableBalance = this.getAvailableBalance(transaction.fromAddress);
                const totalCost = transaction.getTotalCost();
                if (availableBalance < totalCost) {
                    throw new Error(`Insufficient balance. Available: ${availableBalance}, Need: ${totalCost}`);
                }
                this.pendingTransactions.push(transaction);
            } finally {
                releaseTxLock(transaction.fromAddress);
            }
        } else {
            this.pendingTransactions.push(transaction);
        }
        logger.info(`📝 Transaction added: ${transaction.amount} ${config.blockchain.coinSymbol} + ${transaction.fee} fee`);
        if (this.onTransactionAdded) {
            this.onTransactionAdded(transaction);
        }
        return true;
    }

    /**
     * Calculate current mining reward based on halving schedule
     * Reward halves every `halvingInterval` blocks
     */
    getCurrentReward(): number {
        const halvings = Math.floor(this.chain.length / config.blockchain.halvingInterval);
        // After 64 halvings, reward becomes effectively 0
        if (halvings >= 64) return 0;
        return Math.floor(config.blockchain.validatorReward / Math.pow(2, halvings));
    }

    /**
     * Get next halving info
     */
    getHalvingInfo() {
        const currentBlock = this.chain.length;
        const halvingInterval = config.blockchain.halvingInterval;
        const currentHalvings = Math.floor(currentBlock / halvingInterval);
        const nextHalvingBlock = (currentHalvings + 1) * halvingInterval;
        const blocksUntilHalving = nextHalvingBlock - currentBlock;

        return {
            currentReward: this.getCurrentReward(),
            nextHalvingBlock,
            blocksUntilHalving,
            halvingsDone: currentHalvings,
            halvingInterval,
        };
    }

    /**
     * Get PoS reward with Solana-style gradual inflation reduction
     * Start: 10 LVE, Min: 1 LVE, reduces by 0.5% every 100,000 blocks
     */
    getPoSReward(): number {
        const INITIAL_REWARD = 10;
        const MIN_REWARD = 1;
        const RLVECTION_INTERVAL = 100000; // blocks
        const RLVECTION_RATE = 0.995; // 0.5% reduction
        const reductions = Math.floor(this.chain.length / RLVECTION_INTERVAL);
        const reward = INITIAL_REWARD * Math.pow(RLVECTION_RATE, reductions);
        return Math.max(MIN_REWARD, Math.round(reward * 100) / 100);
    }

    /**
     * Get PoS inflation info
     */
    getInflationInfo() {
        const currentReward = this.getPoSReward();
        const blocksPerYear = 365 * 24 * 60 * 2; // ~2 blocks/min with 30s intervals
        const rewardsPerYear = currentReward * blocksPerYear;
        const currentBlock = this.chain.length;
        const reductionInterval = 100000;
        const nextReductionBlock = (Math.floor(currentBlock / reductionInterval) + 1) * reductionInterval;
        const blocksUntilReduction = nextReductionBlock - currentBlock;
        return {
            currentReward,
            minReward: 1,
            initialReward: 10,
            reductionRate: '0.5%',
            reductionInterval: 100000,
            blocksUntilNextReduction: blocksUntilReduction,
            estimatedYearlyInflation: rewardsPerYear,
        };
    }

    /**
     * Get recommended fee based on mempool congestion
     * Similar to how Bitcoin/Ethereum estimate fees dynamically
     */
    getRecommendedFee(): { low: number; medium: number; high: number; recommended: number; congestion: string } {
        const pending = this.pendingTransactions.length;
        const maxPerBlock = config.blockchain.maxTxPerBlock;
        const minFee = config.blockchain.minFee;

        // Calculate congestion level
        const congestionRatio = pending / maxPerBlock;

        let low: number, medium: number, high: number, congestion: string;

        if (congestionRatio < 0.5) {
            // Low congestion - minimal fees
            low = minFee;
            medium = minFee;
            high = minFee * 2;
            congestion = 'low';
        } else if (congestionRatio < 1.5) {
            // Medium congestion
            low = minFee;
            medium = minFee * 2;
            high = minFee * 5;
            congestion = 'medium';
        } else if (congestionRatio < 3) {
            // High congestion
            low = minFee * 2;
            medium = minFee * 5;
            high = minFee * 10;
            congestion = 'high';
        } else {
            // Very high congestion
            low = minFee * 5;
            medium = minFee * 10;
            high = minFee * 20;
            congestion = 'critical';
        }

        return {
            low: Math.round(low * 100) / 100,
            medium: Math.round(medium * 100) / 100,
            high: Math.round(high * 100) / 100,
            recommended: Math.round(medium * 100) / 100,
            congestion,
        };
    }

    /**
     * Create PoS block (instant, no mining needed)
     */
    createPoSBlock(validatorAddress: string, signFn: (hash: string) => string): Block {
        const sortedByFee = [...this.pendingTransactions].sort((a, b) => b.fee - a.fee);
        const txToInclude = sortedByFee.slice(0, config.blockchain.maxTxPerBlock);
        const remainingTx = sortedByFee.slice(config.blockchain.maxTxPerBlock);
        const totalFees = txToInclude.reduce((sum, tx) => SafeMath.add(sum, tx.fee), 0);
        // Solana-style gradual inflation reduction
        // Start: 10 LVE, Min: 1 LVE, reduces by 0.5% every 100,000 blocks
        const validatorReward = this.getPoSReward();
        const totalReward = SafeMath.add(validatorReward, totalFees);
        const rewardTx = new Transaction(null, validatorAddress, totalReward, 0);
        const block = new Block(
            this.chain.length,
            Date.now(),
            [rewardTx, ...txToInclude],
            this.getLatestBlock().hash,
            0, // No difficulty in PoS
            undefined,
            'pos'
        );
        block.signAsValidator(validatorAddress, signFn);
        this.chain.push(block);
        addCheckpoint(block.index, block.hash);
        this.pendingTransactions = remainingTx;
        this.updateBalanceCache();

        // Process staking transactions from the new block
        // This is where staking state changes are applied (on-chain staking)
        for (const tx of txToInclude) {
            if (tx.type === 'STAKE' && tx.fromAddress) {
                stakingPool.applyStakeFromTx(tx.fromAddress, tx.amount);
                logger.info(`📊 STAKE applied: ${tx.fromAddress.slice(0, 12)}... staked ${tx.amount} LVE`);
            } else if (tx.type === 'UNSTAKE' && tx.fromAddress) {
                stakingPool.applyUnstakeFromTx(tx.fromAddress, tx.amount);
                logger.info(`📊 UNSTAKE applied: ${tx.fromAddress.slice(0, 12)}... unstaked ${tx.amount} LVE`);
            } else if (tx.type === 'DELEGATE' && tx.fromAddress && tx.data) {
                stakingPool.applyDelegateFromTx(tx.fromAddress, tx.data, tx.amount);
                logger.info(`📊 DELEGATE applied: ${tx.fromAddress.slice(0, 12)}... delegated ${tx.amount} LVE`);
            } else if (tx.type === 'UNDELEGATE' && tx.fromAddress && tx.data) {
                stakingPool.applyUndelegateFromTx(tx.fromAddress, tx.data, tx.amount);
                logger.info(`📊 UNDELEGATE applied: ${tx.fromAddress.slice(0, 12)}... undelegated ${tx.amount} LVE`);
            }
        }

        this.updateFinality();
        logger.info(`🏦 PoS Block ${block.index} validated! Reward: ${totalReward} ${config.blockchain.coinSymbol}`);
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
        // Check cache first
        if (this.balanceCache.has(address)) {
            return this.balanceCache.get(address)!;
        }
        let balance = 0;
        for (const block of this.chain) {
            for (const tx of block.transactions) {
                if (tx.fromAddress === address) {
                    balance -= tx.amount;
                }
                if (tx.toAddress === address) {
                    balance += tx.amount;
                }
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
     * Get available balance for spending (confirmed - pending - staked)
     */
    getAvailableBalance(address: string): number {
        const availableBalance = this.getBalance(address);
        let pendingOutgoing = 0;
        for (const tx of this.pendingTransactions) {
            if (tx.fromAddress === address) {
                pendingOutgoing += tx.amount + tx.fee;
            }
        }
        return Math.max(0, availableBalance - pendingOutgoing);
    }

    /**
     * Update balance cache (call after adding blocks)
     */
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
                if (tx.fromAddress === address || tx.toAddress === address) {
                    transactions.push(tx);
                }
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
                if (tx.id === id) {
                    return { transaction: tx, block };
                }
            }
        }

        // Check pending
        const pending = this.pendingTransactions.find(tx => tx.id === id);
        if (pending) {
            return { transaction: pending, block: null as unknown as Block };
        }

        return null;
    }

    /**
     * Check if the chain is valid
     */
    isChainValid(): boolean {
        for (let i = 1; i < this.chain.length; i++) {
            const currentBlock = this.chain[i];
            const previousBlock = this.chain[i - 1];

            // Check current block hash
            if (currentBlock.hash !== currentBlock.calculateHash()) {
                logger.error(`Invalid hash at block ${i}`);
                return false;
            }

            // Check link to previous block
            if (currentBlock.previousHash !== previousBlock.hash) {
                logger.error(`Invalid previous hash at block ${i}`);
                return false;
            }

            // Check transactions
            if (!currentBlock.hasValidTransactions()) {
                logger.error(`Invalid transactions at block ${i}`);
                return false;
            }

            // Check PoS block signature (Ed25519)
            if (currentBlock.consensusType === 'pos' && currentBlock.signature && currentBlock.validator) {
                // Note: For full verification, we need validator's nodeId (public key)
                // This requires a validator registry mapping address -> nodeId
                // For now, we verify signature format is valid (non-empty hex)
                if (!/^[0-9a-fA-F]+$/.test(currentBlock.signature)) {
                    logger.error(`Invalid signature format at block ${i}`);
                    return false;
                }
            }
        }

        return true;
    }

    /**
     * Replace chain with a longer valid chain
     */
    replaceChain(newChain: Block[]): boolean {
        if (newChain.length <= this.chain.length) {
            logger.warn('Received chain is not longer than current chain');
            return false;
        }

        // Validate new chain
        const tempBlockchain = new Blockchain();
        tempBlockchain.chain = newChain;
        if (!tempBlockchain.isChainValid()) {
            logger.warn('Received chain is invalid');
            return false;
        }

        this.chain = newChain;
        this.updateBalanceCache();

        // Rebuild staking state from chain transactions (on-chain staking)
        stakingPool.rebuildFromChain(newChain);

        logger.info(`🔄 Chain replaced with ${newChain.length} blocks`);
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

        const inflationInfo = this.getInflationInfo();

        return {
            blocks: this.chain.length,
            transactions: totalTransactions,
            pendingTransactions: this.pendingTransactions.length,
            consensusType: 'pos' as const,
            latestBlockHash: this.getLatestBlock()?.hash || 'none',
            validatorReward: inflationInfo.currentReward,
            initialReward: inflationInfo.initialReward,
            minReward: inflationInfo.minReward,
            blocksUntilNextReduction: inflationInfo.blocksUntilNextReduction,
            reductionInterval: inflationInfo.reductionInterval,
            coinSymbol: config.blockchain.coinSymbol,
            totalSupply: totalAmount,
        };
    }

    /**
     * Convert to plain object for storage
     */
    toJSON(): BlockchainData {
        return {
            chain: this.chain.map(block => block.toJSON()),
            pendingTransactions: this.pendingTransactions.map(tx => tx.toJSON()),
            difficulty: this.difficulty,
            validatorReward: this.validatorReward,
        };
    }
}
