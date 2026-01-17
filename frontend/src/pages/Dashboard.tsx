import React from 'react';
import { StatCard, Card } from '../components';
import { useBlockchain } from '../hooks';
import { useI18n } from '../contexts';
import './Dashboard.css';

const formatHash = (hash: string) => `${hash.substring(0, 8)}...${hash.substring(hash.length - 6)}`;
const formatTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return new Date(timestamp).toLocaleTimeString();
};

export const Dashboard: React.FC = () => {
    const { stats, chain, loading } = useBlockchain();
    const { t } = useI18n();

    if (loading && !stats) {
        return <div className="loading-state">{t('common.loading')}</div>;
    }

    const latestBlock = chain.length > 0 ? chain[chain.length - 1] : null;

    return (
        <div className="dashboard fade-in">
            <div className="page-header">
                <h1>Overview</h1>
            </div>

            {/* Key Metrics - Clean, no icons */}
            <div className="stats-grid">
                <StatCard
                    label={t('dashboard.totalBlocks')}
                    value={(stats?.blocks || 0).toLocaleString()}
                />
                <StatCard
                    label={t('dashboard.totalTx')}
                    value={(stats?.transactions || 0).toLocaleString()}
                />
                <StatCard
                    label="Supply"
                    value={`${(stats?.totalSupply || 0).toLocaleString()} EDU`}
                />
                <StatCard
                    label="Active Validators"
                    value={"0"}
                />
            </div>

            {/* Main Content */}
            <div className="dashboard-content">
                <Card title="Latest Block" className="latest-block-card">
                    {latestBlock ? (
                        <div className="latest-block-detail">
                            <div className="block-hero">
                                <div className="block-index">#{latestBlock.index}</div>
                                <div className="block-time">{formatTime(latestBlock.timestamp)}</div>
                            </div>

                            <div className="detail-grid">
                                <div className="detail-item">
                                    <span className="label">Hash</span>
                                    <span className="value font-mono">{formatHash(latestBlock.hash)}</span>
                                </div>
                                <div className="detail-item">
                                    <span className="label">Miner</span>
                                    <span className="value font-mono">{latestBlock.miner ? formatHash(latestBlock.miner) : 'Genesis'}</span>
                                </div>
                                <div className="detail-item">
                                    <span className="label">Transactions</span>
                                    <span className="value">{latestBlock.transactions.length}</span>
                                </div>
                                <div className="detail-item">
                                    <span className="label">Difficulty</span>
                                    <span className="value">{latestBlock.difficulty}</span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <p className="empty-state">No blocks yet</p>
                    )}
                </Card>

                <Card title="Network Status" className="network-status-card">
                    <div className="network-info-list">
                        <div className="info-row">
                            <span>Status</span>
                            <span className="status-badge success">Active</span>
                        </div>
                        <div className="info-row">
                            <span>Consensus</span>
                            <span>PoS (Proof of Stake)</span>
                        </div>
                        <div className="info-row">
                            <span>Current Epoch</span>
                            <span>{Math.floor((stats?.blocks || 0) / 100)}</span>
                        </div>
                        <div className="info-row">
                            <span>Block Time</span>
                            <span>~30s</span>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
};
