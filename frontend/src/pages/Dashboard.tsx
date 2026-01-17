import React from 'react';
import { Blocks, FileText, Coins, Timer, BarChart3, Scissors, Clock } from 'lucide-react';
import { StatCard, Card } from '../components';
import { useBlockchain } from '../hooks';
import { useI18n } from '../contexts';
import type { Block } from '../api/client';
import './Dashboard.css';

const formatHash = (hash: string) => `${hash.substring(0, 8)}...${hash.substring(hash.length - 6)}`;
const formatTime = (timestamp: number) => new Date(timestamp).toLocaleString();

export const Dashboard: React.FC = () => {
    const { stats, chain, loading } = useBlockchain();
    const { t } = useI18n();

    if (loading && !stats) {
        return <div className="loading-state">{t('common.loading')}</div>;
    }

    const recentBlocks = chain.slice(-5).reverse();

    return (
        <div className="dashboard fade-in">
            <div className="page-header">
                <h1>{t('dashboard.title')}</h1>
                <p>{t('dashboard.subtitle')}</p>
            </div>

            <div className="stats-grid">
                <StatCard icon={<Blocks size={24} />} label={t('dashboard.totalBlocks')} value={stats?.blocks || 0} />
                <StatCard icon={<FileText size={24} />} label={t('dashboard.totalTx')} value={stats?.transactions || 0} />
                <StatCard icon={<Coins size={24} />} label={t('dashboard.validatorReward')} value={`${stats?.validatorReward || 0} ${stats?.coinSymbol || 'EDU'}`} />
                <StatCard icon={<Timer size={24} />} label={t('dashboard.nextReduction')} value={`${stats?.blocksUntilNextReduction || 0} ${t('common.blocks')}`} />
                <StatCard icon={<BarChart3 size={24} />} label={t('dashboard.totalSupply')} value={`${(stats?.totalSupply || 0).toLocaleString()} EDU`} />
                <StatCard icon={<Scissors size={24} />} label={t('dashboard.minReward')} value={`${stats?.minReward || 1} EDU`} />
            </div>

            <div className="dashboard-content">
                <Card title={t('dashboard.recentBlocks')} icon={<Blocks size={20} />} className="recent-blocks">
                    {recentBlocks.length === 0 ? (
                        <p className="empty-state">{t('dashboard.noBlocks')}</p>
                    ) : (
                        <div className="blocks-list">
                            {recentBlocks.map((block: Block) => (
                                <div key={block.hash} className="block-item">
                                    <div className="block-index">#{block.index}</div>
                                    <div className="block-info">
                                        <div className="block-hash font-mono">{formatHash(block.hash)}</div>
                                        <div className="block-meta">
                                            <span>{block.transactions.length} {t('common.tx')}</span>
                                            <span>•</span>
                                            <span>{formatTime(block.timestamp)}</span>
                                        </div>
                                    </div>
                                    <div className="block-nonce">Nonce: {block.nonce.toLocaleString()}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>

                <Card title={t('dashboard.latestBlock')} icon={<Clock size={20} />} className="latest-block">
                    {chain.length > 0 ? (
                        <div className="block-detail">
                            <div className="detail-row"><span className="label">{t('dashboard.index')}</span><span className="value">{chain[chain.length - 1].index}</span></div>
                            <div className="detail-row"><span className="label">{t('dashboard.hash')}</span><span className="value font-mono truncate">{chain[chain.length - 1].hash}</span></div>
                            <div className="detail-row"><span className="label">{t('dashboard.previousHash')}</span><span className="value font-mono truncate">{chain[chain.length - 1].previousHash}</span></div>
                            <div className="detail-row"><span className="label">{t('dashboard.transactions')}</span><span className="value">{chain[chain.length - 1].transactions.length}</span></div>
                            <div className="detail-row"><span className="label">{t('dashboard.difficulty')}</span><span className="value">{chain[chain.length - 1].difficulty}</span></div>
                            <div className="detail-row"><span className="label">{t('dashboard.nonce')}</span><span className="value">{chain[chain.length - 1].nonce.toLocaleString()}</span></div>
                            <div className="detail-row"><span className="label">{t('dashboard.miner')}</span><span className="value font-mono">{chain[chain.length - 1].miner || t('dashboard.genesis')}</span></div>
                        </div>
                    ) : (
                        <p className="empty-state">{t('dashboard.noBlocks')}</p>
                    )}
                </Card>
            </div>
        </div>
    );
};
