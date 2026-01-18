import React, { useState, useEffect } from 'react';
import { FileText, Clock, Inbox, ArrowRight, X, Copy, CheckCircle } from 'lucide-react';
import { useI18n } from '../contexts';
import { transaction } from '../api/client';
import type { Transaction } from '../api/client';
import './Transactions.css';

const formatHash = (hash: string, short = true) => {
    if (!hash) return 'N/A';
    return short ? `${hash.substring(0, 8)}...${hash.slice(-6)}` : hash;
};
const formatTime = (timestamp: number) => new Date(timestamp).toLocaleString();

export const TransactionsPage: React.FC = () => {
    const { t } = useI18n();
    const [pending, setPending] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
    const [copied, setCopied] = useState<string | null>(null);

    useEffect(() => {
        const fetchPending = async () => {
            const res = await transaction.getPending();
            if (res.success && res.data) setPending(res.data.transactions);
            setLoading(false);
        };
        fetchPending();
        const interval = setInterval(fetchPending, 5000);
        return () => clearInterval(interval);
    }, []);

    const copyToClipboard = (text: string, field: string) => {
        navigator.clipboard.writeText(text);
        setCopied(field);
        setTimeout(() => setCopied(null), 2000);
    };

    return (
        <div className="transactions-page fade-in">
            <div className="page-header">
                <h1><FileText className="header-icon" /> {t('transactions.title')}</h1>
            </div>

            <div className="transactions-section">
                <div className="section-header">
                    <Clock size={18} />
                    <span>{t('transactions.pending')}</span>
                    <span className="pending-badge">{pending.length}</span>
                </div>

                {loading ? (
                    <div className="loading-state">{t('common.loading')}</div>
                ) : pending.length === 0 ? (
                    <div className="empty-state">
                        <Inbox size={48} className="empty-icon" />
                        <p>{t('transactions.noTransactions')}</p>
                    </div>
                ) : (
                    <div className="transactions-list">
                        {pending.map((tx) => (
                            <div
                                key={tx.id}
                                className="tx-row"
                                onClick={() => setSelectedTx(tx)}
                            >
                                <div className="tx-addresses">
                                    <span className="tx-from font-mono">
                                        {tx.fromAddress ? formatHash(tx.fromAddress) : 'System'}
                                    </span>
                                    <ArrowRight size={14} className="tx-arrow" />
                                    <span className="tx-to font-mono">{formatHash(tx.toAddress)}</span>
                                </div>
                                <div className="tx-amount-compact">{tx.amount} LVE</div>
                                <span className="tx-status-dot pending"></span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Transaction Detail Modal */}
            {selectedTx && (
                <div className="tx-modal-overlay" onClick={() => setSelectedTx(null)}>
                    <div className="tx-modal" onClick={e => e.stopPropagation()}>
                        <div className="tx-modal-header">
                            <h3>{t('transactions.details') || 'Transaction Details'}</h3>
                            <button className="tx-modal-close" onClick={() => setSelectedTx(null)}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="tx-modal-content">
                            <div className="tx-detail-row">
                                <span className="tx-detail-label">ID</span>
                                <div className="tx-detail-value">
                                    <span className="font-mono">{formatHash(selectedTx.id, false)}</span>
                                    <button
                                        className="copy-btn"
                                        onClick={() => copyToClipboard(selectedTx.id, 'id')}
                                    >
                                        {copied === 'id' ? <CheckCircle size={14} /> : <Copy size={14} />}
                                    </button>
                                </div>
                            </div>

                            <div className="tx-detail-row">
                                <span className="tx-detail-label">{t('transactions.from')}</span>
                                <div className="tx-detail-value">
                                    <span className="font-mono">
                                        {selectedTx.fromAddress || 'System (Mining Reward)'}
                                    </span>
                                    {selectedTx.fromAddress && (
                                        <button
                                            className="copy-btn"
                                            onClick={() => copyToClipboard(selectedTx.fromAddress!, 'from')}
                                        >
                                            {copied === 'from' ? <CheckCircle size={14} /> : <Copy size={14} />}
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="tx-detail-row">
                                <span className="tx-detail-label">{t('transactions.to')}</span>
                                <div className="tx-detail-value">
                                    <span className="font-mono">{selectedTx.toAddress}</span>
                                    <button
                                        className="copy-btn"
                                        onClick={() => copyToClipboard(selectedTx.toAddress, 'to')}
                                    >
                                        {copied === 'to' ? <CheckCircle size={14} /> : <Copy size={14} />}
                                    </button>
                                </div>
                            </div>

                            <div className="tx-detail-divider"></div>

                            <div className="tx-detail-row">
                                <span className="tx-detail-label">{t('transactions.amount') || 'Amount'}</span>
                                <span className="tx-detail-amount">{selectedTx.amount} LVE</span>
                            </div>

                            <div className="tx-detail-row">
                                <span className="tx-detail-label">{t('transactions.fee') || 'Fee'}</span>
                                <span className="tx-detail-fee">{selectedTx.fee || 0} LVE</span>
                            </div>

                            <div className="tx-detail-row">
                                <span className="tx-detail-label">{t('transactions.status') || 'Status'}</span>
                                <span className="tx-status-badge pending">{t('wallet.pending')}</span>
                            </div>

                            <div className="tx-detail-row">
                                <span className="tx-detail-label">{t('transactions.time') || 'Time'}</span>
                                <span className="tx-detail-time">{formatTime(selectedTx.timestamp)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
