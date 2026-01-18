import { Router, Request, Response } from 'express';
import { Blockchain, Transaction } from '../../blockchain/index.js';
import { storage } from '../../storage/index.js';
import { isBlacklisted, checkTransferRate, validateTransaction } from '../../security/index.js';
import { verifySignature } from '../../utils/crypto.js';

export function createTransactionRoutes(blockchain: Blockchain): Router {
    const router = Router();

    // POST /send - must come first
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

    // Example format - MUST be before /:id
    router.get('/example', (_req: Request, res: Response) => {
        const exampleTimestamp = Date.now();
        res.json({
            success: true,
            message: 'This is an example of a valid transaction request format',
            example: {
                endpoint: 'POST /api/transaction/send',
                body: {
                    from: 'tLVE_YourSenderAddressHere',
                    to: 'tLVE_RecipientAddressHere',
                    amount: 10,
                    fee: 0.01,
                    signature: 'hex_signature_created_by_wallet',
                    publicKey: 'your_secp256k1_public_key_hex',
                    timestamp: exampleTimestamp,
                },
                notes: [
                    'signature = sign(sha256(from + to + amount + fee + timestamp), privateKey)',
                    'publicKey must match the from address',
                    'Use the frontend wallet to create properly signed transactions',
                ],
            },
            curl_example: `curl -X POST http://localhost:3001/api/transaction/send -H "Content-Type: application/json" -d '{"from":"tLVE_...", "to":"tLVE_...", "amount":10, "fee":0.01, "signature":"...", "publicKey":"...", "timestamp":${exampleTimestamp}}'`,
        });
    });

    // Pool pending - MUST be before /:id
    router.get('/pool/pending', (_req: Request, res: Response) => {
        res.json({
            success: true,
            data: {
                transactions: blockchain.pendingTransactions.map(tx => tx.toJSON()),
                count: blockchain.pendingTransactions.length,
            },
        });
    });

    // Get by ID - MUST be last (catches all other paths)
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

    return router;
}
