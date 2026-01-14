import { sha256, hashMeetsDifficulty } from '../utils/crypto.js';
import { Transaction, TransactionData } from './Transaction.js';
import { logger } from '../utils/logger.js';
import { miningService } from '../mining/index.js';

export interface BlockData {
    index: number;
    timestamp: number;
    transactions: TransactionData[];
    previousHash: string;
    hash: string;
    nonce: number;
    difficulty: number;
    miner?: string;
}

export class Block implements BlockData {
    public index: number;
    public timestamp: number;
    public transactions: Transaction[];
    public previousHash: string;
    public hash: string;
    public nonce: number;
    public difficulty: number;
    public miner?: string;

    constructor(
        index: number,
        timestamp: number,
        transactions: Transaction[],
        previousHash: string,
        difficulty: number,
        miner?: string
    ) {
        this.index = index;
        this.timestamp = timestamp;
        this.transactions = transactions;
        this.previousHash = previousHash;
        this.difficulty = difficulty;
        this.miner = miner;
        this.nonce = 0;
        this.hash = this.calculateHash();
    }

    /**
     * Calculate the SHA-256 hash of this block
     */
    calculateHash(): string {
        const transactionData = this.transactions
            .map(tx => JSON.stringify(tx.toJSON()))
            .join('');

        return sha256(
            this.index.toString() +
            this.timestamp.toString() +
            transactionData +
            this.previousHash +
            this.nonce.toString() +
            this.difficulty.toString()
        );
    }

    /**
     * Mine the block with Proof of Work (runs in separate worker thread)
     */
    async mineBlock(): Promise<void> {
        const log = logger.child('Mining');
        log.info(`⛏️  Mining block ${this.index} with difficulty ${this.difficulty}...`);
        const blockData = this.index.toString() +
            this.timestamp.toString() +
            this.transactions.map(tx => JSON.stringify(tx.toJSON())).join('') +
            this.previousHash +
            this.difficulty.toString();
        const result = await miningService.mine(blockData, this.difficulty);
        this.hash = result.hash;
        this.nonce = result.nonce;
        log.info(`✨ Block mined in worker! Hash: ${this.hash.substring(0, 16)}... Nonce: ${this.nonce}`);
    }

    /**
     * Check if all transactions in the block are valid
     */
    hasValidTransactions(): boolean {
        for (const tx of this.transactions) {
            if (!tx.isValid()) {
                return false;
            }
        }
        return true;
    }

    /**
     * Convert to plain object for JSON serialization
     */
    toJSON(): BlockData {
        return {
            index: this.index,
            timestamp: this.timestamp,
            transactions: this.transactions.map(tx => tx.toJSON()),
            previousHash: this.previousHash,
            hash: this.hash,
            nonce: this.nonce,
            difficulty: this.difficulty,
            miner: this.miner,
        };
    }

    /**
     * Create Block from plain object
     */
    static fromJSON(data: BlockData): Block {
        const transactions = data.transactions.map(tx => Transaction.fromJSON(tx));
        const block = new Block(
            data.index,
            data.timestamp,
            transactions,
            data.previousHash,
            data.difficulty,
            data.miner
        );
        block.nonce = data.nonce;
        block.hash = data.hash;
        return block;
    }

    /**
     * Create the genesis block
     */
    static createGenesisBlock(
        genesisAmount: number,
        faucetAddress: string,
        difficulty: number
    ): Block {
        const genesisTransaction = new Transaction(
            null,  // From system
            faucetAddress,
            genesisAmount,
            0  // Genesis timestamp
        );

        const genesis = new Block(
            0,
            0,  // Genesis timestamp
            [genesisTransaction],
            '0'.repeat(64),  // No previous hash
            difficulty,
            'GENESIS'
        );

        // Don't mine genesis - set fixed hash
        genesis.hash = genesis.calculateHash();

        return genesis;
    }
}
