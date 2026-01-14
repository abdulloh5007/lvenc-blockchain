import { Router, Request, Response } from 'express';
import { Blockchain, Transaction } from '../../blockchain/index.js';
import { Wallet } from '../../wallet/index.js';
import { storage } from '../../storage/index.js';
import { config } from '../../config.js';
import { isBlacklisted, checkTransferRate, validateTransaction } from '../../security/index.js';

export function createTransactionRoutes(blockchain: Blockchain): Router {
    const router = Router();

    router.post('/send', (req: Request, res: Response) => {
        const { fromAddress, toAddress, amount, privateKey, fee } = req.body;
        if (!fromAddress || !toAddress || !amount || !privateKey) {
            res.status(400).json({ success: false, error: 'Missing required fields' });
            return;
        }
        if (isBlacklisted(fromAddress) || isBlacklisted(toAddress)) {
            res.status(403).json({ success: false, error: 'Address is blacklisted' });
            return;
        }
        if (!checkTransferRate(fromAddress)) {
            res.status(429).json({ success: false, error: 'Transfer rate limit exceeded' });
            return;
        }
        const txFee = fee !== undefined ? Number(fee) : config.blockchain.minFee;
        const validation = validateTransaction(fromAddress, toAddress, Number(amount), txFee);
        if (!validation.valid) {
            res.status(400).json({ success: false, error: validation.error });
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
