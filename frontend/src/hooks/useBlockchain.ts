import { useState, useEffect, useCallback } from 'react';
import { blockchain } from '../api/client';
import type { BlockchainStats, Block } from '../api/client';

export function useBlockchain() {
    const [stats, setStats] = useState<BlockchainStats | null>(null);
    const [chain, setChain] = useState<Block[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchStats = useCallback(async () => {
        const res = await blockchain.getStats();
        if (res.success && res.data) {
            setStats(res.data);
            setError(null);
        } else {
            setError(res.error || 'Failed to fetch stats');
        }
    }, []);

    const fetchChain = useCallback(async () => {
        const res = await blockchain.getChain();
        if (res.success && res.data) {
            setChain(res.data.chain);
        }
    }, []);

    const refresh = useCallback(async () => {
        setLoading(true);
        await Promise.all([fetchStats(), fetchChain()]);
        setLoading(false);
    }, [fetchStats, fetchChain]);

    useEffect(() => {
        refresh();
        const interval = setInterval(refresh, 5000);
        return () => clearInterval(interval);
    }, [refresh]);

    return { stats, chain, loading, error, refresh };
}
