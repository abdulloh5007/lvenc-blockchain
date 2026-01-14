import { Block, BlockData } from './Block.js';
import { Transaction, TransactionData } from './Transaction.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

export interface BlockchainData {
    chain: BlockData[];
    pendingTransactions: TransactionData[];
    difficulty: number;
    miningReward: number;
}

export class Blockchain {
    public chain: Block[];
    public pendingTransactions: Transaction[];
    public difficulty: number;
    public miningReward: number;
    private balanceCache: Map<string, number>;

    // Event callbacks
    public onBlockMined?: (block: Block) => void;
    public onTransactionAdded?: (tx: Transaction) => void;

    constructor() {
        this.difficulty = config.blockchain.difficulty;
        this.miningReward = config.blockchain.miningReward;
        this.pendingTransactions = [];
        this.balanceCache = new Map();
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
                this.difficulty
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
        this.miningReward = data.miningReward;
        this.updateBalanceCache();
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
        // Limit pending transactions to prevent memory issues
        if (this.pendingTransactions.length >= config.blockchain.maxPendingTx) {
            throw new Error(`Transaction pool is full (max ${config.blockchain.maxPendingTx}). Mine some blocks first!`);
        }

        // Check minimum fee (skip for system transactions)
        if (transaction.fromAddress !== null && transaction.fee < config.blockchain.minFee) {
            throw new Error(`Minimum fee is ${config.blockchain.minFee} ${config.blockchain.coinSymbol}`);
        }

        // Validate transaction
        if (!transaction.fromAddress && !transaction.toAddress) {
            throw new Error('Transaction must have from or to address');
        }

        if (!transaction.isValid()) {
            throw new Error('Cannot add invalid transaction');
        }

        // Check sender balance (amount + fee)
        if (transaction.fromAddress) {
            const balance = this.getBalance(transaction.fromAddress);
            const totalCost = transaction.getTotalCost();
            if (balance < totalCost) {
                throw new Error(`Insufficient balance. Have: ${balance}, Need: ${totalCost} (${transaction.amount} + ${transaction.fee} fee)`);
            }
        }

        this.pendingTransactions.push(transaction);
        logger.info(`📝 Transaction added: ${transaction.amount} ${config.blockchain.coinSymbol} + ${transaction.fee} fee (${this.pendingTransactions.length}/${config.blockchain.maxPendingTx})`);

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
        return Math.floor(config.blockchain.miningReward / Math.pow(2, halvings));
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
     * Mine pending transactions
     */
    minePendingTransactions(minerAddress: string): Block {
        // Sort pending transactions by fee (highest first) for priority
        const sortedByFee = [...this.pendingTransactions].sort((a, b) => b.fee - a.fee);

        // Take only maxTxPerBlock transactions
        const txToInclude = sortedByFee.slice(0, config.blockchain.maxTxPerBlock);
        const remainingTx = sortedByFee.slice(config.blockchain.maxTxPerBlock);

        // Calculate total fees collected
        const totalFees = txToInclude.reduce((sum, tx) => sum + tx.fee, 0);

        // Calculate current reward with halving
        const currentReward = this.getCurrentReward();
        const totalReward = currentReward + totalFees;

        // Create mining reward transaction (block reward + fees)
        const rewardTx = new Transaction(
            null,
            minerAddress,
            totalReward,
            0 // reward has no fee
        );

        // Create new block with selected transactions
        const block = new Block(
            this.chain.length,
            Date.now(),
            [rewardTx, ...txToInclude],
            this.getLatestBlock().hash,
            this.difficulty,
            minerAddress
        );

        // Mine the block
        block.mineBlock();

        // Add to chain
        this.chain.push(block);

        // Keep remaining transactions in pool
        this.pendingTransactions = remainingTx;

        // Update balance cache
        this.updateBalanceCache();

        // Check if halving just occurred
        const halvingInfo = this.getHalvingInfo();
        if (halvingInfo.blocksUntilHalving === config.blockchain.halvingInterval) {
            logger.info(`🎊 HALVING! New reward: ${halvingInfo.currentReward} ${config.blockchain.coinSymbol}`);
        }

        logger.info(`💰 Block ${block.index} mined! Reward: ${currentReward} + ${totalFees} fees = ${totalReward} ${config.blockchain.coinSymbol} (${txToInclude.length} tx, ${remainingTx.length} remaining)`);

        if (this.onBlockMined) {
            this.onBlockMined(block);
        }

        return block;
    }

    /**
     * Get balance of an address
     */
    getBalance(address: string): number {
        // Check cache first
        if (this.balanceCache.has(address)) {
            return this.balanceCache.get(address)!;
        }

        let balance = 0;

        // Go through all blocks
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

        const halvingInfo = this.getHalvingInfo();

        return {
            blocks: this.chain.length,
            transactions: totalTransactions,
            pendingTransactions: this.pendingTransactions.length,
            difficulty: this.difficulty,
            latestBlockHash: this.getLatestBlock()?.hash || 'none',
            miningReward: halvingInfo.currentReward,
            initialReward: config.blockchain.miningReward,
            nextHalvingBlock: halvingInfo.nextHalvingBlock,
            blocksUntilHalving: halvingInfo.blocksUntilHalving,
            halvingsDone: halvingInfo.halvingsDone,
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
            miningReward: this.miningReward,
        };
    }
}
