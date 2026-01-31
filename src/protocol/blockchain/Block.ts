import { sha256 } from '../utils/crypto.js';
import { Transaction, TransactionData } from './Transaction.js';
import { logger } from '../utils/logger.js';

export interface BlockData {
    index: number;
    timestamp: number;
    transactions: TransactionData[];
    previousHash: string;
    hash: string;
    validator?: string;
    signature?: string;
}

export class Block implements BlockData {
    public index: number;
    public timestamp: number;
    public transactions: Transaction[];
    public previousHash: string;
    public hash: string;
    public validator?: string;
    public signature?: string;

    constructor(
        index: number,
        timestamp: number,
        transactions: Transaction[],
        previousHash: string,
        validator?: string,
        signature?: string
    ) {
        this.index = index;
        this.timestamp = timestamp;
        this.transactions = transactions;
        this.previousHash = previousHash;
        this.validator = validator;
        this.signature = signature;
        this.hash = this.calculateHash();
    }

    /**
     * Calculate the SHA-256 hash of this block
     * Structure: Index + Timestamp + Transactions + PreviousHash + (Validator?)
     * Note: Validator is usually part of the signature, not the block hash content itself unless we want to bind it.
     * For now, keeping it simple: Content -> Hash -> Signed by Validator.
     */
    calculateHash(): string {
        const transactionData = this.transactions
            .map(tx => JSON.stringify(tx.toJSON()))
            .join('');

        // PoS Hash: Index + Timestamp + Txs + PrevHash
        return sha256(
            this.index.toString() +
            this.timestamp.toString() +
            transactionData +
            this.previousHash
        );
    }

    /**
     * Sign block as PoS validator
     */
    signAsValidator(validatorAddress: string, signFn: (hash: string) => string): void {
        this.validator = validatorAddress;
        // Hash doesn't change based on validator, but signature does
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
            data.validator,
            data.signature
        );
        block.hash = data.hash;
        return block;
    }

    /**
     * Create the genesis block
     */
    static createGenesisBlock(
        genesisAmount: number,
        faucetAddress: string,
        fixedTimestamp?: number,
        genesisPublicKey?: string
    ): Block {
        const GENESIS_TX_ID = 'genesis-tx-00000000-0000-0000-0000-000000000001';
        const GENESIS_STAKE_TX_ID = 'genesis-tx-00000000-0000-0000-0000-000000000002';

        const transactions: Transaction[] = [];

        // 1. Initial supply distribution
        const genesisTransaction = new Transaction(
            null,
            faucetAddress,
            genesisAmount,
            0,
            fixedTimestamp || 0,
            GENESIS_TX_ID,
            0,
            undefined,
            'TRANSFER'
        );
        transactions.push(genesisTransaction);

        // 2. Initial Validator Bootstrap
        if (genesisPublicKey) {
            const minValidatorStake = 1000;
            const stakeTransaction = new Transaction(
                faucetAddress,
                'STAKE_POOL',
                minValidatorStake,
                0,
                fixedTimestamp || 0,
                GENESIS_STAKE_TX_ID,
                1,
                undefined,
                'STAKE',
                undefined,
                'ed25519',
                genesisPublicKey
            );
            stakeTransaction.signature = '00'.repeat(64);
            transactions.push(stakeTransaction);
        }

        const genesis = new Block(
            0,
            fixedTimestamp || 0,
            transactions,
            '0'.repeat(64),
            'GENESIS_VALIDATOR', // Placeholder validator
            'GENESIS_SIGNATURE'
        );
        genesis.hash = genesis.calculateHash();
        return genesis;
    }
}
