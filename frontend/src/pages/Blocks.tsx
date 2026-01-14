import React from 'react';
import { Blocks, Search, Hash, Clock } from 'lucide-react';
import { Card } from '../components';
import { useBlockchain } from '../hooks';
import { useI18n } from '../contexts';
import type { Block } from '../api/client';
import './Blocks.css';

const formatHash = (hash: string) => `${hash.substring(0, 12)}...${hash.substring(hash.length - 8)}`;
const formatTime = (timestamp: number, genesis: string) => timestamp === 0 ? genesis : new Date(timestamp).toLocaleString();

export const BlocksPage: React.FC = () => {
    const { chain, loading } = useBlockchain();
    const { t } = useI18n();
    const [selectedBlock, setSelectedBlock] = React.useState<Block | null>(null);

    if (loading && chain.length === 0) {
        return <div className="loading-state">{t('common.loading')}</div>;
    }

    const blocks = [...chain].reverse();

    return (
        <div className="blocks-page fade-in">
            <div className="page-header">
                <h1><Blocks className="header-icon" /> {t('blocks.title')}</h1>
                <p>{t('blocks.subtitle')}</p>
            </div>

            <div className="blocks-content">
                <Card title={`${t('blocks.title')} (${chain.length})`} icon={<Hash size={20} />} className="blocks-list-card">
                    <div className="blocks-table">
                        <div className="table-header">
                            <span>{t('dashboard.index')}</span>
                            <span>{t('blocks.hash')}</span>
                            <span>{t('blocks.transactions')}</span>
                            <span>{t('blocks.nonce')}</span>
                            <span>{t('blocks.timestamp')}</span>
                        </div>
                        {blocks.map((block) => (
                            <div key={block.hash} className={`table-row ${selectedBlock?.hash === block.hash ? 'selected' : ''}`} onClick={() => setSelectedBlock(block)}>
                                <span className="block-index">#{block.index}</span>
                                <span className="block-hash font-mono">{formatHash(block.hash)}</span>
                                <span className="block-txs">{block.transactions.length} {t('common.tx')}</span>
                                <span className="block-nonce">{block.nonce.toLocaleString()}</span>
                                <span className="block-time">{formatTime(block.timestamp, t('dashboard.genesis'))}</span>
                            </div>
                        ))}
                    </div>
                </Card>

                {selectedBlock ? (
                    <Card title={`${t('blocks.blockDetails')} #${selectedBlock.index}`} icon={<Search size={20} />} className="block-detail-card">
                        <div className="block-details">
                            <div className="detail-section">
                                <div className="detail-grid">
                                    <div className="detail-item"><span className="label">{t('dashboard.index')}</span><span className="value">{selectedBlock.index}</span></div>
                                    <div className="detail-item"><span className="label">{t('blocks.timestamp')}</span><span className="value">{formatTime(selectedBlock.timestamp, t('dashboard.genesis'))}</span></div>
                                    <div className="detail-item"><span className="label">{t('dashboard.difficulty')}</span><span className="value">{selectedBlock.difficulty}</span></div>
                                    <div className="detail-item"><span className="label">{t('blocks.nonce')}</span><span className="value">{selectedBlock.nonce.toLocaleString()}</span></div>
                                </div>
                            </div>
                            <div className="detail-section">
                                <div className="hash-item"><span className="label">{t('blocks.hash')}</span><code className="hash font-mono">{selectedBlock.hash}</code></div>
                                <div className="hash-item"><span className="label">{t('blocks.previousHash')}</span><code className="hash font-mono">{selectedBlock.previousHash}</code></div>
                            </div>
                            <div className="detail-section">
                                <h4>{t('blocks.transactions')} ({selectedBlock.transactions.length})</h4>
                                <div className="transactions-list">
                                    {selectedBlock.transactions.map((tx, i) => (
                                        <div key={tx.id} className="tx-item">
                                            <div className="tx-header"><span className="tx-index">TX #{i + 1}</span><span className="tx-amount">{tx.amount} EDU</span></div>
                                            <div className="tx-addresses">
                                                <div className="address-item"><span className="label">{t('transactions.from')}</span><span className="address font-mono">{tx.fromAddress ? formatHash(tx.fromAddress) : 'System'}</span></div>
                                                <span className="arrow">→</span>
                                                <div className="address-item"><span className="label">{t('transactions.to')}</span><span className="address font-mono">{formatHash(tx.toAddress)}</span></div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            {selectedBlock.miner && (
                                <div className="miner-info"><span className="label">{t('blocks.miner')}</span><span className="value font-mono">{formatHash(selectedBlock.miner)}</span></div>
                            )}
                        </div>
                    </Card>
                ) : (
                    <Card title={t('blocks.blockDetails')} icon={<Search size={20} />} className="block-detail-card">
                        <div className="empty-state"><Clock size={48} /><p>{t('blocks.selectBlock')}</p></div>
                    </Card>
                )}
            </div>
        </div>
    );
};
