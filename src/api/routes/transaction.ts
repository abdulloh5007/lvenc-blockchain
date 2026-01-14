import { Router, Request, Response } from 'express';
import { Blockchain, Transaction } from '../../blockchain/index.js';
import { Wallet } from '../../wallet/index.js';
import { storage } from '../../storage/index.js';
import { config } from '../../config.js';

export function createTransactionRoutes(blockchain: Blockchain): Router {
    const router = Router();

    // Create and send transaction
    router.post('/send', (req: Request, res: Response) => {
        const { fromAddress, toAddress, amount, privateKey, fee } = req.body;

        // Validate input
        if (!fromAddress || !toAddress || !amount || !privateKey) {
            res.status(400).json({
                success: false,
                error: 'Missing required fields: fromAddress, toAddress, amount, privateKey',
            });
            return;
        }

        if (amount <= 0) {
            res.status(400).json({
                success: false,
                error: 'Amount must be positive',
            });
            return;
        }

        // Use provided fee or default to minFee
        const txFee = fee !== undefined ? Number(fee) : config.blockchain.minFee;

        if (txFee < config.blockchain.minFee) {
            res.status(400).json({
                success: false,
                error: `Minimum fee is ${config.blockchain.minFee} ${config.blockchain.coinSymbol}`,
            });
            return;
        }

        try {
            // Create wallet from private key
            const wallet = new Wallet(privateKey);

            // Verify wallet address matches
            if (wallet.address !== fromAddress) {
                res.status(400).json({
                    success: false,
                    error: 'Private key does not match from address',
                });
                return;
            }

            // Check balance (amount + fee)
            const balance = blockchain.getBalance(fromAddress);
            const totalCost = amount + txFee;
            if (balance < totalCost) {
                res.status(400).json({
                    success: false,
                    error: `Insufficient balance. Have: ${balance}, Need: ${totalCost} (${amount} + ${txFee} fee)`,
                });
                return;
            }

            // Create and sign transaction with fee
            const transaction = wallet.createTransaction(toAddress, amount, txFee);

            // Add to blockchain
            blockchain.addTransaction(transaction);

            // Save blockchain state
            storage.saveBlockchain(blockchain.toJSON());

            res.json({
                success: true,
                data: {
                    transactionId: transaction.id,
                    from: transaction.fromAddress,
                    to: transaction.toAddress,
                    amount: transaction.amount,
                    fee: transaction.fee,
                    status: 'pending',
                },
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: error instanceof Error ? error.message : 'Transaction failed',
            });
        }
    });

    // Get transaction by ID
    router.get('/:id', (req: Request, res: Response) => {
        const { id } = req.params;
        const result = blockchain.getTransaction(id);

        if (!result) {
            res.status(404).json({
                success: false,
                error: 'Transaction not found',
            });
            return;
        }

        res.json({
            success: true,
            data: {
                transaction: result.transaction.toJSON(),
                blockIndex: result.block ? result.block.index : null,
                confirmed: result.block !== null,
            },
        });
    });

    // Get pending transactions
    router.get('/pool/pending', (_req: Request, res: Response) => {
        res.json({
            success: true,
            data: {
                transactions: blockchain.pendingTransactions.map(tx => tx.toJSON()),
                count: blockchain.pendingTransactions.length,
            },
        });
    });

    return router;
}
