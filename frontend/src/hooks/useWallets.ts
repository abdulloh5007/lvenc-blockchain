import { useState, useEffect, useCallback } from 'react';
import { wallet } from '../api/client';
import type { WalletInfo } from '../api/client';

export function useWallets() {
    const [wallets, setWallets] = useState<WalletInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchWallets = useCallback(async () => {
        const res = await wallet.list();
        if (res.success && res.data) {
            setWallets(res.data);
            setError(null);
        } else {
            setError(res.error || 'Failed to fetch wallets');
        }
        setLoading(false);
    }, []);

    const createWallet = useCallback(async (label?: string) => {
        const res = await wallet.create(label);
        if (res.success) {
            await fetchWallets();
            return res.data;
        }
        throw new Error(res.error || 'Failed to create wallet');
    }, [fetchWallets]);

    const importWallet = useCallback(async (mnemonic: string, label?: string) => {
        const res = await wallet.import(mnemonic, label);
        if (res.success) {
            await fetchWallets();
            return res.data;
        }
        throw new Error(res.error || 'Failed to import wallet');
    }, [fetchWallets]);

    useEffect(() => {
        fetchWallets();
        const interval = setInterval(fetchWallets, 10000);
        return () => clearInterval(interval);
    }, [fetchWallets]);

    return { wallets, loading, error, createWallet, importWallet, refresh: fetchWallets };
}
