import { Router, Request, Response } from 'express';
import { Wallet } from '../../wallet/index.js';
import { Blockchain } from '../../blockchain/index.js';
import { storage } from '../../storage/index.js';
import { isBlacklisted, checkTransferRate } from '../../security/index.js';

export function createWalletRoutes(blockchain: Blockchain): Router {
    const router = Router();

    router.post('/new', (req: Request, res: Response) => {
        const { label } = req.body;
        const wallet = new Wallet(undefined, label);

        storage.saveWallet(wallet.export());

        res.json({
            success: true,
            data: {
                address: wallet.address,
                publicKey: wallet.publicKey,
                mnemonic: wallet.mnemonic,
                label: wallet.label,
                warning: 'Save your seed phrase! It will not be shown again.',
            },
        });
    });

    router.get('/:address/balance', (req: Request, res: Response) => {
        const { address } = req.params;
        const balance = blockchain.getBalance(address);

        res.json({
            success: true,
            data: { address, balance, symbol: 'EDU' },
        });
    });

    router.get('/:address/transactions', (req: Request, res: Response) => {
        const { address } = req.params;
        const transactions = blockchain.getTransactionHistory(address);

        res.json({
            success: true,
            data: {
                address,
                transactions: transactions.map(tx => tx.toJSON()),
                count: transactions.length,
            },
        });
    });

    router.get('/', (_req: Request, res: Response) => {
        const wallets = storage.listWallets();

        res.json({
            success: true,
            data: wallets.map(w => ({
                address: w.address,
                label: w.label,
                balance: blockchain.getBalance(w.address),
                createdAt: w.createdAt,
            })),
        });
    });

    router.post('/import', (req: Request, res: Response) => {
        const { mnemonic, privateKey, label } = req.body;
        const key = mnemonic || privateKey;

        if (!key) {
            res.status(400).json({ success: false, error: 'Mnemonic or private key is required' });
            return;
        }

        try {
            const wallet = new Wallet(key, label);
            storage.saveWallet(wallet.export());

            res.json({
                success: true,
                data: {
                    address: wallet.address,
                    publicKey: wallet.publicKey,
                    label: wallet.label,
                },
            });
        } catch (error) {
            res.status(400).json({ success: false, error: 'Invalid mnemonic or private key' });
        }
    });

    router.post('/validate-mnemonic', (req: Request, res: Response) => {
        const { mnemonic } = req.body;
        const isValid = Wallet.validateMnemonic(mnemonic || '');
        res.json({ success: true, data: { valid: isValid } });
    });

    return router;
}
