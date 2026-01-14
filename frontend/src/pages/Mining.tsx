import React, { useState } from 'react';
import { Pickaxe, Rocket, Trophy, Info, Scissors, Zap, Timer, Hash } from 'lucide-react';
import { Card, Button } from '../components';
import { useWallets, useBlockchain } from '../hooks';
import { useI18n } from '../contexts';
import { mining } from '../api/client';
import './Mining.css';

export const MiningPage: React.FC = () => {
    const { wallets, refresh } = useWallets();
    const { stats, refresh: refreshBlockchain } = useBlockchain();
    const { t } = useI18n();
    const [selectedWallet, setSelectedWallet] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    const handleMine = async () => {
        if (!selectedWallet) {
            setError(t('mining.selectWallet'));
            return;
        }
        setLoading(true);
        setError(null);
        setResult(null);
        const res = await mining.mine(selectedWallet);
        if (res.success && res.data) {
            setResult(res.data);
            refresh();
            refreshBlockchain();
        } else {
            setError(res.error || t('common.error'));
        }
        setLoading(false);
    };

    return (
        <div className="mining-page fade-in">
            <div className="page-header">
                <h1><Pickaxe className="header-icon" /> {t('mining.title')}</h1>
                <p>{t('mining.subtitle')}</p>
            </div>

            <div className="mining-content">
                <Card title={t('mining.startMining')} icon={<Rocket size={20} />} className="mining-control">
                    <div className="mining-form">
                        <div className="form-group">
                            <label>{t('mining.selectWallet')}</label>
                            <select className="select" value={selectedWallet} onChange={(e) => setSelectedWallet(e.target.value)}>
                                <option value="">{t('wallet.selectWallet')}...</option>
                                {wallets.map((w) => (
                                    <option key={w.address} value={w.address}>{w.label || 'Wallet'} ({w.balance || 0} EDU)</option>
                                ))}
                            </select>
                        </div>
                        <Button onClick={handleMine} loading={loading} className="mine-button">
                            <Pickaxe size={18} /> {loading ? t('common.loading') : t('mining.mineBlock')}
                        </Button>
                        {loading && <div className="mining-animation"><div className="pickaxe-icon"><Pickaxe size={48} /></div><div className="mining-text">{t('common.loading')}</div></div>}
                        {error && <div className="mining-error">{error}</div>}
                    </div>
                </Card>

                {result && (
                    <Card title={t('mining.blockMined')} icon={<Trophy size={20} />} className="mining-result">
                        <div className="result-content">
                            <div className="success-icon"><Trophy size={64} /></div>
                            <h2>{t('common.success')}!</h2>
                            <div className="result-details">
                                <div className="detail-item"><span className="label">{t('dashboard.index')}</span><span className="value">#{result.block?.index}</span></div>
                                <div className="detail-item"><span className="label">{t('dashboard.hash')}</span><span className="value font-mono">{result.block?.hash.substring(0, 20)}...</span></div>
                                <div className="detail-item"><span className="label">{t('dashboard.transactions')}</span><span className="value">{result.block?.transactions}</span></div>
                                <div className="detail-item"><span className="label">{t('dashboard.nonce')}</span><span className="value">{result.block?.nonce.toLocaleString()}</span></div>
                                <div className="detail-item reward"><span className="label">{t('mining.reward')}</span><span className="value">+{result.block?.reward} EDU</span></div>
                            </div>
                        </div>
                    </Card>
                )}

                <Card title={t('mining.miningInfo')} icon={<Info size={20} />} className="mining-info">
                    <div className="info-grid">
                        <div className="info-item"><Zap className="info-icon" /><span className="info-label">{t('mining.reward')}</span><span className="info-value">{stats?.miningReward || 50} EDU</span></div>
                        <div className="info-item"><Timer className="info-icon" /><span className="info-label">{t('dashboard.nextHalving')}</span><span className="info-value">{stats?.blocksUntilHalving || 0} {t('common.blocks')}</span></div>
                        <div className="info-item"><Hash className="info-icon" /><span className="info-label">{t('dashboard.halvingsDone')}</span><span className="info-value">{stats?.halvingsDone || 0}</span></div>
                    </div>
                    <div className="halving-info">
                        <h4><Scissors size={16} /> {t('mining.halving')}</h4>
                        <div className="halving-table">
                            <div className="halving-row"><span>0-99:</span><span className={stats?.halvingsDone === 0 ? 'current' : ''}>50 EDU</span></div>
                            <div className="halving-row"><span>100-199:</span><span className={stats?.halvingsDone === 1 ? 'current' : ''}>25 EDU</span></div>
                            <div className="halving-row"><span>200-299:</span><span className={stats?.halvingsDone === 2 ? 'current' : ''}>12 EDU</span></div>
                            <div className="halving-row"><span>300-399:</span><span className={stats?.halvingsDone === 3 ? 'current' : ''}>6 EDU</span></div>
                        </div>
                    </div>
                    <div className="how-it-works">
                        <h4>{t('mining.howItWorks')}</h4>
                        <ol>
                            <li>{t('mining.step1')}</li>
                            <li>{t('mining.step2')}</li>
                            <li>{t('mining.step3')}</li>
                            <li>{t('mining.step4')}</li>
                        </ol>
                    </div>
                </Card>
            </div>
        </div>
    );
};
