import { sha256, hashMeetsDifficulty } from '../utils/crypto.js';
import { Transaction, TransactionData } from './Transaction.js';
import { logger } from '../utils/logger.js';

export type ConsensusType = 'pow' | 'pos';

export interface BlockData {
    index: number;
    timestamp: number;
    transactions: TransactionData[];
    previousHash: string;
    hash: string;
    nonce: number;
    difficulty: number;
    miner?: string;
    // PoS fields
    consensusType?: ConsensusType;
    validator?: string;
    signature?: string;
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
    // PoS fields
    public consensusType: ConsensusType;
    public validator?: string;
    public signature?: string;

    constructor(
        index: number,
        timestamp: number,
        transactions: Transaction[],
        previousHash: string,
        difficulty: number,
        miner?: string,
        consensusType: ConsensusType = 'pow'
    ) {
        this.index = index;
        this.timestamp = timestamp;
        this.transactions = transactions;
        this.previousHash = previousHash;
        this.difficulty = difficulty;
        this.miner = miner;
        this.consensusType = consensusType;
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
     * Sign block as PoS validator (instant, no mining needed)
     */
    signAsValidator(validatorAddress: string, signFn: (hash: string) => string): void {
        this.consensusType = 'pos';
        this.validator = validatorAddress;
        this.hash = this.calculateHash();
        this.signature = signFn(this.hash);
        logger.child('PoS').info(`✅ Block ${this.index} validated by ${validatorAddress.slice(0, 10)}...`);
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
            consensusType: this.consensusType,
            validator: this.validator,
            signature: this.signature,
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
            data.miner,
            data.consensusType || 'pow'
        );
        block.nonce = data.nonce;
        block.hash = data.hash;
        block.validator = data.validator;
        block.signature = data.signature;
        return block;
    }

    /**
     * Create the genesis block
     */
    static createGenesisBlock(
        genesisAmount: number,
        faucetAddress: string,
        difficulty: number,
        fixedTimestamp?: number,
        genesisPublicKey?: string
    ): Block {
        // Fixed genesis transaction ID for network consistency
        const GENESIS_TX_ID = 'genesis-tx-00000000-0000-0000-0000-000000000001';
        const GENESIS_STAKE_TX_ID = 'genesis-tx-00000000-0000-0000-0000-000000000002';

        const transactions: Transaction[] = [];

        // 1. Initial supply distribution (transfer to genesis address)
        const genesisTransaction = new Transaction(
            null,
            faucetAddress,
            genesisAmount,
            0,
            fixedTimestamp || 0, // Use fixed timestamp for tx too
            GENESIS_TX_ID,       // Fixed ID
            0,                   // nonce
            undefined,           // chainId
            'TRANSFER'           // type
        );
        transactions.push(genesisTransaction);

        // 2. Initial Validator Bootstrap (STAKE transaction)
        // If we have a public key for the genesis address, we can bootstrap the first validator
        if (genesisPublicKey) {
            const minValidatorStake = 1000; // Hardcoded bootstrap amount (should verify against config)
            const stakeTransaction = new Transaction(
                faucetAddress,
                'STAKE_POOL',
                minValidatorStake,
                0,
                fixedTimestamp || 0,
                GENESIS_STAKE_TX_ID,
                1,                   // nonce 1 (after initial transfer)
                undefined,           // chainId
                'STAKE',             // type
                undefined,           // data
                'ed25519',           // signatureScheme
                genesisPublicKey     // public key
            );
            // Sign with dummy signature (Genesis block is trusted by definition)
            stakeTransaction.signature = '00'.repeat(64);
            transactions.push(stakeTransaction);
        }

        const genesis = new Block(
            0,
            fixedTimestamp || 0, // Use fixed timestamp or 0
            transactions,
            '0'.repeat(64),
            difficulty,
            'GENESIS',
            'pos'
        );
        genesis.hash = genesis.calculateHash();
        return genesis;
    }
}
