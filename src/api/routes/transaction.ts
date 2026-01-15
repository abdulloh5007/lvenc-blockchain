import { Router, Request, Response } from 'express';
import { Blockchain, Transaction } from '../../blockchain/index.js';
import { storage } from '../../storage/index.js';
import { isBlacklisted, checkTransferRate, validateTransaction } from '../../security/index.js';
import { verifySignature } from '../../utils/crypto.js';
export function createTransactionRoutes(blockchain: Blockchain): Router {
    const router = Router();
    router.post('/send', (req: Request, res: Response) => {
        const { from, to, amount, fee, signature, publicKey, timestamp } = req.body;
        if (!from || !to || !amount || !signature || !publicKey || !timestamp) {
            res.status(400).json({ success: false, error: 'Required: from, to, amount, signature, publicKey, timestamp' });
            return;
        }
        if (isBlacklisted(from) || isBlacklisted(to)) {
            res.status(403).json({ success: false, error: 'Address is blacklisted' });
            return;
        }
        if (!checkTransferRate(from)) {
            res.status(429).json({ success: false, error: 'Transfer rate limit exceeded' });
            return;
        }
        const txFee = fee !== undefined ? Number(fee) : 0.01;
        const validation = validateTransaction(from, to, Number(amount), txFee);
        if (!validation.valid) {
            res.status(400).json({ success: false, error: validation.error });
            return;
        }
        try {
            const balance = blockchain.getBalance(from);
            const totalCost = Number(amount) + txFee;
            if (balance < totalCost) {
                res.status(400).json({
                    success: false,
                    error: `Insufficient balance. Have: ${balance}, Need: ${totalCost}`,
                });
                return;
            }
            // Use timestamp from client to match signature
            const transaction = new Transaction(from, to, Number(amount), txFee, Number(timestamp));
            const txHash = transaction.calculateHash();
            if (!verifySignature(txHash, signature, publicKey)) {
                res.status(400).json({ success: false, error: 'Invalid signature' });
                return;
            }
            (transaction as { signature?: string }).signature = signature;
            blockchain.addTransaction(transaction);
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
    router.get('/:id', (req: Request, res: Response) => {
        const { id } = req.params;
        const result = blockchain.getTransaction(id);
        if (!result) {
            res.status(404).json({ success: false, error: 'Transaction not found' });
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
