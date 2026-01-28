import React, { useState, useEffect, useCallback } from 'react';
import { useWallets } from '../hooks';
import './Swap.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

interface PoolInfo {
    initialized: boolean;
    reserves: {
        lve: number;
        uzs: number;
    };
    price: {
        lvePerUsdt: number;
        uzsPerEdu: number;
    };
    tvl: {
        totalUZS: number;
    };
}

interface QuoteResult {
    tokenIn: string;
    tokenOut: string;
    amountIn: number;
    amountOut: number;
    fee: number;
    priceImpact: number;
}

const Swap: React.FC = () => {
    const { wallets, signSwapTransactionWithPin } = useWallets();
    const wallet = wallets[0]; // Use first wallet
    const [poolInfo, setPoolInfo] = useState<PoolInfo | null>(null);
    const [tokenIn, setTokenIn] = useState<'LVE' | 'UZS'>('LVE');
    const [amountIn, setAmountIn] = useState<string>('');
    const [quote, setQuote] = useState<QuoteResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Fetch pool info
    const fetchPoolInfo = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/pool/info`);
            const data = await res.json();
            if (data.success) {
                setPoolInfo(data.data);
            }
        } catch {
            console.error('Failed to fetch pool info');
        }
    }, []);

    // Fetch quote
    const fetchQuote = useCallback(async () => {
        if (!amountIn || parseFloat(amountIn) <= 0) {
            setQuote(null);
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/pool/quote?from=${tokenIn}&amount=${amountIn}`);
            const data = await res.json();
            if (data.success) {
                setQuote(data.data);
                setError(null);
            } else {
                setError(data.error);
                setQuote(null);
            }
        } catch {
            setError('Failed to get quote');
            setQuote(null);
        }
    }, [tokenIn, amountIn]);

    useEffect(() => {
        fetchPoolInfo();
        const interval = setInterval(fetchPoolInfo, 10000);
        return () => clearInterval(interval);
    }, [fetchPoolInfo]);

    useEffect(() => {
        const debounce = setTimeout(fetchQuote, 300);
        return () => clearTimeout(debounce);
    }, [fetchQuote]);

    const flipTokens = () => {
        setTokenIn(tokenIn === 'LVE' ? 'UZS' : 'LVE');
        setAmountIn('');
        setQuote(null);
    };

    const handleSwap = async () => {
        if (!wallet || !quote) return;

        setLoading(true);
        setError(null);
        setSuccess(null);

        try {
            const amount = parseFloat(amountIn);
            const minAmountOut = quote.amountOut * 0.99; // 1% slippage

            // Sign transaction client-side
            const signed = await signSwapTransactionWithPin(
                wallet.address,
                tokenIn === 'LVE' ? 'LVE' : 'USDT',
                amount,
                minAmountOut
            );

            if (!signed) {
                setError('Swap cancelled');
                setLoading(false);
                return;
            }

            // Execute swap via API
            const res = await fetch(`${API_BASE}/pool/swap`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    from: wallet.address,
                    tokenIn: tokenIn === 'LVE' ? 'LVE' : 'USDT',
                    amountIn: amount,
                    minAmountOut,
                    signature: signed.signature,
                    publicKey: signed.publicKey,
                    nonce: signed.nonce,
                    chainId: signed.chainId,
                    signatureScheme: signed.signatureScheme,
                }),
            });

            const data = await res.json();
            if (data.success) {
                const tokenOut = tokenIn === 'LVE' ? 'UZS' : 'LVE';
                setSuccess(`✅ Swapped ${amount} ${tokenIn} → ${data.data.amountOut.toFixed(4)} ${tokenOut}`);
                setAmountIn('');
                setQuote(null);
                fetchPoolInfo();
            } else {
                setError(data.error || 'Swap failed');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Swap failed');
        } finally {
            setLoading(false);
        }
    };

    const tokenOut = tokenIn === 'LVE' ? 'UZS' : 'LVE';

    return (
        <div className="swap-page">
            <div className="swap-container">
                <div className="swap-header">
                    <h2>💱 Swap</h2>
                    <span className="swap-fee">Fee: 0.3%</span>
                </div>

                {/* Pool Info */}
                {poolInfo && poolInfo.initialized && (
                    <div className="pool-info-bar">
                        <span>1 LVE = {poolInfo.price.uzsPerEdu.toFixed(4)} UZS</span>
                        <span>TVL: ${poolInfo.tvl.totalUZS.toFixed(2)}</span>
                    </div>
                )}

                {!poolInfo?.initialized && (
                    <div className="pool-not-initialized">
                        ⚠️ Pool not initialized. Use CLI to add initial liquidity.
                    </div>
                )}

                {/* Swap Card */}
                <div className="swap-card">
                    {/* Input */}
                    <div className="swap-input-container">
                        <label>From</label>
                        <div className="swap-input">
                            <input
                                type="number"
                                placeholder="0.0"
                                value={amountIn}
                                onChange={(e) => setAmountIn(e.target.value)}
                                disabled={!poolInfo?.initialized}
                            />
                            <button className="token-select">{tokenIn}</button>
                        </div>
                    </div>

                    {/* Flip Button */}
                    <button className="flip-button" onClick={flipTokens}>
                        ⇅
                    </button>

                    {/* Output */}
                    <div className="swap-input-container">
                        <label>To</label>
                        <div className="swap-input">
                            <input
                                type="text"
                                placeholder="0.0"
                                value={quote ? quote.amountOut.toFixed(6) : ''}
                                readOnly
                            />
                            <button className="token-select">{tokenOut}</button>
                        </div>
                    </div>

                    {/* Quote Details */}
                    {quote && (
                        <div className="quote-details">
                            <div className="quote-row">
                                <span>Rate</span>
                                <span>
                                    1 {tokenIn} = {(quote.amountOut / quote.amountIn).toFixed(6)} {tokenOut}
                                </span>
                            </div>
                            <div className="quote-row">
                                <span>Fee</span>
                                <span>{quote.fee.toFixed(6)} {tokenIn}</span>
                            </div>
                            <div className="quote-row">
                                <span>Price Impact</span>
                                <span className={quote.priceImpact > 5 ? 'high-impact' : ''}>
                                    {quote.priceImpact.toFixed(2)}%
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Error/Success Messages */}
                    {error && <div className="swap-error">{error}</div>}
                    {success && <div className="swap-success">{success}</div>}

                    {/* Swap Button */}
                    <button
                        className="swap-button"
                        onClick={handleSwap}
                        disabled={!wallet || !quote || loading || !poolInfo?.initialized}
                    >
                        {loading ? 'Processing...' : !wallet ? 'Connect Wallet' : 'Swap'}
                    </button>
                </div>

                {/* Reserves */}
                {poolInfo?.initialized && (
                    <div className="reserves-info">
                        <h4>Pool Reserves</h4>
                        <div className="reserve-row">
                            <span>LVE</span>
                            <span>{poolInfo.reserves.lve.toLocaleString()}</span>
                        </div>
                        <div className="reserve-row">
                            <span>UZS</span>
                            <span>{poolInfo.reserves.uzs.toLocaleString()}</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Swap;
