import React, { useState, useEffect } from 'react';
import { FileText, Clock, Inbox, ArrowRight, BookOpen } from 'lucide-react';
import { Card } from '../components';
import { useI18n } from '../contexts';
import { transaction } from '../api/client';
import type { Transaction } from '../api/client';
import './Transactions.css';

const formatHash = (hash: string) => hash ? `${hash.substring(0, 10)}...${hash.substring(hash.length - 6)}` : 'N/A';
const formatTime = (timestamp: number) => new Date(timestamp).toLocaleString();

export const TransactionsPage: React.FC = () => {
    const { t } = useI18n();
    const [pending, setPending] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);

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

    return (
        <div className="transactions-page fade-in">
            <div className="page-header">
                <h1><FileText className="header-icon" /> {t('transactions.title')}</h1>
                <p>{t('transactions.subtitle')}</p>
            </div>

            <div className="transactions-content">
                <Card title={`${t('transactions.pending')} (${pending.length})`} icon={<Clock size={20} />} className="pending-card">
                    {loading ? (
                        <p className="loading-state">{t('common.loading')}</p>
                    ) : pending.length === 0 ? (
                        <div className="empty-state">
                            <Inbox size={48} className="empty-icon" />
                            <p>{t('transactions.noTransactions')}</p>
                        </div>
                    ) : (
                        <div className="pending-list">
                            {pending.map((tx) => (
                                <div key={tx.id} className="tx-card">
                                    <div className="tx-header">
                                        <span className="tx-id font-mono">{formatHash(tx.id)}</span>
                                        <span className="tx-status pending">{t('wallet.pending')}</span>
                                    </div>
                                    <div className="tx-flow">
                                        <div className="tx-party">
                                            <span className="party-label">{t('transactions.from')}</span>
                                            <span className="party-address font-mono">{tx.fromAddress ? formatHash(tx.fromAddress) : 'System'}</span>
                                        </div>
                                        <div className="tx-arrow-container">
                                            <div className="tx-amount-badge">{tx.amount} EDU</div>
                                            <ArrowRight className="tx-arrow" />
                                        </div>
                                        <div className="tx-party">
                                            <span className="party-label">{t('transactions.to')}</span>
                                            <span className="party-address font-mono">{formatHash(tx.toAddress)}</span>
                                        </div>
                                    </div>
                                    <div className="tx-time">{formatTime(tx.timestamp)}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>

                <Card title={t('transactions.aboutTx')} icon={<BookOpen size={20} />} className="info-card">
                    <div className="tx-info">
                        <p>{t('transactions.txDesc')}</p>
                    </div>
                </Card>
            </div>
        </div>
    );
};
