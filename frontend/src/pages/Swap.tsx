import React, { useState, useEffect, useCallback } from 'react';
import { ArrowUpDown, Droplets, AlertCircle, Wallet, RefreshCw, Loader, TrendingDown, Percent, DollarSign } from 'lucide-react';
import { useWallets } from '../hooks';
import { CustomSelect } from '../components/CustomSelect';
import { formatBalance } from '../utils/format';
import './Swap.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

interface PoolInfo {
    initialized: boolean;
    reserves: {
        lve: number;
        usdt: number;
    };
    price: {
        lvePerUsdt: number;
        usdtPerEdu: number;
    };
    tvl: {
        totalUSDT: number;
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
    const { wallets, signSwapTransactionWithPin, refresh } = useWallets();

    // Wallet selection
    const [selectedWalletIndex, setSelectedWalletIndex] = useState(0);
    const selectedWallet = wallets[selectedWalletIndex] || null;

    // USDT balance (mock for testnet)
    const [usdtBalance, setUsdtBalance] = useState(0);
    const [faucetLoading, setFaucetLoading] = useState(false);
    const [faucetMessage, setFaucetMessage] = useState<string | null>(null);

    const [poolInfo, setPoolInfo] = useState<PoolInfo | null>(null);
    const [tokenIn, setTokenIn] = useState<'LVE' | 'USDT'>('LVE');
    const [amountIn, setAmountIn] = useState<string>('');
    const [quote, setQuote] = useState<QuoteResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Create wallet options for CustomSelect
    const walletOptions = wallets.map((w, i) => ({
        value: String(i),
        label: `${w.label || `Wallet ${i + 1}`} (${w.address.slice(0, 10)}...)`
    }));

    // Fetch USDT balance
    const fetchUsdtBalance = useCallback(async () => {
        if (!selectedWallet) return;
        try {
            const res = await fetch(`${API_BASE}/faucet/balance/${selectedWallet.address}`);
            const data = await res.json();
            if (data.success) {
                setUsdtBalance(data.data.balance);
            }
        } catch {
            console.error('Failed to fetch USDT balance');
        }
    }, [selectedWallet]);

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

    // Request USDT from faucet
    const requestFaucet = async () => {
        if (!selectedWallet) return;

        setFaucetLoading(true);
        setFaucetMessage(null);

        try {
            const res = await fetch(`${API_BASE}/faucet/usdt`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address: selectedWallet.address }),
            });
            const data = await res.json();

            if (data.success) {
                setFaucetMessage(`+${data.data.amount} USDT received!`);
                setUsdtBalance(data.data.balance);
            } else {
                setFaucetMessage(data.error);
            }
        } catch {
            setFaucetMessage('Faucet request failed');
        } finally {
            setFaucetLoading(false);
            setTimeout(() => setFaucetMessage(null), 3000);
        }
    };

    useEffect(() => {
        fetchPoolInfo();
        const interval = setInterval(fetchPoolInfo, 10000);
        return () => clearInterval(interval);
    }, [fetchPoolInfo]);

    useEffect(() => {
        fetchUsdtBalance();
    }, [fetchUsdtBalance, selectedWallet]);

    useEffect(() => {
        const debounce = setTimeout(fetchQuote, 300);
        return () => clearTimeout(debounce);
    }, [fetchQuote]);

    const flipTokens = () => {
        setTokenIn(tokenIn === 'LVE' ? 'USDT' : 'LVE');
        setAmountIn('');
        setQuote(null);
    };

    // Balance validation
    const getAvailableBalance = () => {
        if (tokenIn === 'LVE') {
            return selectedWallet?.balance || 0;
        }
        return usdtBalance;
    };

    const hasInsufficientBalance = () => {
        const amount = parseFloat(amountIn) || 0;
        return amount > getAvailableBalance();
    };

    const handleSwap = async () => {
        if (!selectedWallet || !quote) return;

        // Balance check
        if (hasInsufficientBalance()) {
            setError(`Insufficient ${tokenIn} balance`);
            return;
        }

        setLoading(true);
        setError(null);
        setSuccess(null);

        try {
            const amount = parseFloat(amountIn);
            const minAmountOut = quote.amountOut * 0.99; // 1% slippage

            // Sign transaction client-side
            const signed = await signSwapTransactionWithPin(
                selectedWallet.address,
                tokenIn,
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
                    from: selectedWallet.address,
                    tokenIn: tokenIn,
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
                const tokenOut = tokenIn === 'LVE' ? 'USDT' : 'LVE';
                setSuccess(`Swapped ${amount} ${tokenIn} → ${data.data.amountOut.toFixed(4)} ${tokenOut}`);
                setAmountIn('');
                setQuote(null);
                fetchPoolInfo();
                fetchUsdtBalance();
                refresh(); // Refresh LVE balances
            } else {
                setError(data.error || 'Swap failed');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Swap failed');
        } finally {
            setLoading(false);
        }
    };

    const tokenOut = tokenIn === 'LVE' ? 'USDT' : 'LVE';

    return (
        <div className="swap-page">
            <div className="swap-container">
                <div className="swap-header">
                    <h2><ArrowUpDown size={24} /> Swap</h2>
                    <span className="swap-fee"><Percent size={14} /> 0.3% Fee</span>
                </div>

                {/* Wallet Selector */}
                <div className="wallet-selector">
                    <label><Wallet size={14} /> Select Wallet</label>
                    {wallets.length === 0 ? (
                        <div className="no-wallet">
                            <AlertCircle size={16} />
                            No wallets found. Create one first.
                        </div>
                    ) : (
                        <CustomSelect
                            options={walletOptions}
                            value={String(selectedWalletIndex)}
                            onChange={(v) => setSelectedWalletIndex(Number(v))}
                            placeholder="Select wallet..."
                        />
                    )}
                </div>

                {/* Balance Display */}
                {selectedWallet && (
                    <div className="balance-display">
                        <div className="balance-row">
                            <span>LVE Balance:</span>
                            <span className="balance-value">{formatBalance(selectedWallet.balance)} LVE</span>
                        </div>
                        <div className="balance-row">
                            <span>USDT Balance:</span>
                            <span className="balance-value">{formatBalance(usdtBalance)} USDT</span>
                            <button
                                className="faucet-button"
                                onClick={requestFaucet}
                                disabled={faucetLoading}
                            >
                                {faucetLoading ? <Loader size={14} className="spin" /> : <Droplets size={14} />}
                                <span>Get USDT</span>
                            </button>
                        </div>
                        {faucetMessage && (
                            <div className={`faucet-message ${faucetMessage.includes('received') ? 'success' : 'error'}`}>
                                {faucetMessage}
                            </div>
                        )}
                    </div>
                )}

                {/* Pool Info */}
                {poolInfo && poolInfo.initialized && (
                    <div className="pool-info-bar">
                        <span><RefreshCw size={14} /> 1 LVE = {poolInfo.price.usdtPerEdu.toFixed(4)} USDT</span>
                        <span><DollarSign size={14} /> TVL: ${poolInfo.tvl.totalUSDT.toLocaleString()}</span>
                    </div>
                )}

                {!poolInfo?.initialized && (
                    <div className="pool-not-initialized">
                        <AlertCircle size={18} />
                        Pool not initialized. Use CLI to add initial liquidity.
                    </div>
                )}

                {/* Swap Card */}
                <div className="swap-card">
                    {/* Input */}
                    <div className="swap-input-container">
                        <label>
                            From
                            <span className="available-balance">
                                Available: {getAvailableBalance().toLocaleString()} {tokenIn}
                            </span>
                        </label>
                        <div className={`swap-input ${hasInsufficientBalance() ? 'insufficient' : ''}`}>
                            <input
                                type="number"
                                placeholder="0.0"
                                value={amountIn}
                                onChange={(e) => setAmountIn(e.target.value)}
                                disabled={!poolInfo?.initialized || !selectedWallet}
                            />
                            <button className="token-select">{tokenIn}</button>
                        </div>
                        {hasInsufficientBalance() && amountIn && (
                            <div className="insufficient-warning">
                                <AlertCircle size={12} />
                                Insufficient {tokenIn} balance
                            </div>
                        )}
                    </div>

                    {/* Flip Button */}
                    <button className="flip-button" onClick={flipTokens}>
                        <ArrowUpDown size={18} />
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
                                <span><RefreshCw size={12} /> Rate</span>
                                <span>
                                    1 {tokenIn} = {(quote.amountOut / quote.amountIn).toFixed(6)} {tokenOut}
                                </span>
                            </div>
                            <div className="quote-row">
                                <span><Percent size={12} /> Fee</span>
                                <span>{quote.fee.toFixed(6)} {tokenIn}</span>
                            </div>
                            <div className="quote-row">
                                <span><TrendingDown size={12} /> Price Impact</span>
                                <span className={quote.priceImpact > 5 ? 'high-impact' : ''}>
                                    {quote.priceImpact.toFixed(2)}%
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Error/Success Messages */}
                    {error && <div className="swap-error"><AlertCircle size={16} /> {error}</div>}
                    {success && <div className="swap-success">{success}</div>}

                    {/* Swap Button */}
                    <button
                        className="swap-button"
                        onClick={handleSwap}
                        disabled={!selectedWallet || !quote || loading || !poolInfo?.initialized || hasInsufficientBalance()}
                    >
                        {loading ? (
                            <><Loader size={18} className="spin" /> Processing...</>
                        ) : !selectedWallet ? (
                            'Select Wallet'
                        ) : hasInsufficientBalance() ? (
                            `Insufficient ${tokenIn}`
                        ) : (
                            <>Swap</>
                        )}
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
                            <span>USDT</span>
                            <span>{poolInfo.reserves.usdt.toLocaleString()}</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Swap;
