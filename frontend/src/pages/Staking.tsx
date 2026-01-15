import React, { useState, useEffect } from 'react';
import { Coins, Users, Lock, Unlock, Award, TrendingUp } from 'lucide-react';
import { Card, Button, CustomSelect } from '../components';
import { useWallets } from '../hooks';
import { useI18n } from '../contexts';
import { staking, type ValidatorInfo } from '../api/client';
import './Staking.css';

export const StakingPage: React.FC = () => {
    const { wallets, refresh } = useWallets();
    const { t } = useI18n();
    const [selectedWallet, setSelectedWallet] = useState('');
    const [stakeAmount, setStakeAmount] = useState('100');
    const [unstakeAmount, setUnstakeAmount] = useState('');
    const [loading, setLoading] = useState(false);
    const [validators, setValidators] = useState<ValidatorInfo[]>([]);
    const [totalStaked, setTotalStaked] = useState(0);
    const [userStake, setUserStake] = useState(0);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        loadValidators();
    }, []);

    useEffect(() => {
        if (selectedWallet) loadUserStake();
    }, [selectedWallet]);

    const loadValidators = async () => {
        const res = await staking.getValidators();
        if (res.success && res.data) {
            setValidators(res.data.validators);
            setTotalStaked(res.data.totalStaked);
        }
    };

    const loadUserStake = async () => {
        const res = await staking.getStake(selectedWallet);
        if (res.success && res.data) {
            setUserStake(res.data.stake);
        }
    };

    const handleStake = async () => {
        if (!selectedWallet || !stakeAmount) return;
        setLoading(true);
        setMessage(null);
        const res = await staking.stake(selectedWallet, Number(stakeAmount));
        if (res.success) {
            setMessage({ type: 'success', text: `✅ Staked ${stakeAmount} EDU` });
            refresh();
            loadValidators();
            loadUserStake();
        } else {
            setMessage({ type: 'error', text: res.error || 'Staking failed' });
        }
        setLoading(false);
    };

    const handleUnstake = async () => {
        if (!selectedWallet || !unstakeAmount) return;
        setLoading(true);
        setMessage(null);
        const res = await staking.unstake(selectedWallet, Number(unstakeAmount));
        if (res.success) {
            setMessage({ type: 'success', text: `🔓 Unstake requested (24h cooldown)` });
            loadValidators();
            loadUserStake();
        } else {
            setMessage({ type: 'error', text: res.error || 'Unstake failed' });
        }
        setLoading(false);
    };

    const handleClaim = async () => {
        if (!selectedWallet) return;
        setLoading(true);
        const res = await staking.claim(selectedWallet);
        if (res.success && res.data) {
            setMessage({ type: 'success', text: res.data.message });
            refresh();
        }
        setLoading(false);
    };

    return (
        <div className="staking-page fade-in">
            <div className="page-header">
                <h1><Coins className="header-icon" /> {t('staking.title')}</h1>
                <p>{t('staking.subtitle')}</p>
            </div>

            <div className="staking-stats">
                <Card className="stat-card">
                    <TrendingUp size={24} />
                    <div className="stat-info">
                        <span className="stat-value">{totalStaked.toLocaleString()} EDU</span>
                        <span className="stat-label">{t('staking.totalStaked')}</span>
                    </div>
                </Card>
                <Card className="stat-card">
                    <Users size={24} />
                    <div className="stat-info">
                        <span className="stat-value">{validators.length}</span>
                        <span className="stat-label">{t('staking.validators')}</span>
                    </div>
                </Card>
                <Card className="stat-card">
                    <Award size={24} />
                    <div className="stat-info">
                        <span className="stat-value">2 EDU</span>
                        <span className="stat-label">{t('staking.reward')}</span>
                    </div>
                </Card>
            </div>

            <div className="staking-content">
                <Card title={t('staking.stake')} icon={<Lock size={20} />} className="staking-form-card">
                    <div className="form-group">
                        <label>{t('wallet.selectWallet')}</label>
                        <CustomSelect
                            options={[
                                { value: '', label: `${t('wallet.selectWallet')}...` },
                                ...wallets.map(w => ({
                                    value: w.address,
                                    label: `${w.label || 'Wallet'} (${w.balance || 0} EDU)`
                                }))
                            ]}
                            value={selectedWallet}
                            onChange={setSelectedWallet}
                        />
                    </div>
                    {selectedWallet && (
                        <div className="user-stake-info">
                            <span>{t('staking.yourStake')}: <strong>{userStake} EDU</strong></span>
                        </div>
                    )}
                    <div className="form-group">
                        <label>{t('staking.amount')} (min 100 EDU)</label>
                        <input
                            type="number"
                            value={stakeAmount}
                            onChange={e => setStakeAmount(e.target.value)}
                            min="100"
                            placeholder="100"
                        />
                    </div>
                    <div className="button-group">
                        <Button onClick={handleStake} disabled={loading || !selectedWallet} variant="primary">
                            <Lock size={16} /> {t('staking.stake')}
                        </Button>
                    </div>

                    <hr className="divider" />

                    <div className="form-group">
                        <label>{t('staking.unstakeAmount')}</label>
                        <input
                            type="number"
                            value={unstakeAmount}
                            onChange={e => setUnstakeAmount(e.target.value)}
                            placeholder="Amount to unstake"
                        />
                    </div>
                    <div className="button-group">
                        <Button onClick={handleUnstake} disabled={loading || !selectedWallet || !unstakeAmount} variant="secondary">
                            <Unlock size={16} /> {t('staking.unstake')}
                        </Button>
                        <Button onClick={handleClaim} disabled={loading || !selectedWallet} variant="ghost">
                            {t('staking.claim')}
                        </Button>
                    </div>

                    {message && (
                        <div className={`message ${message.type}`}>{message.text}</div>
                    )}
                </Card>

                <Card title={t('staking.validators')} icon={<Users size={20} />} className="validators-card">
                    {validators.length === 0 ? (
                        <p className="no-validators">{t('staking.noValidators')}</p>
                    ) : (
                        <div className="validators-list">
                            {validators.map((v, i) => (
                                <div key={v.address} className="validator-item">
                                    <span className="validator-rank">#{i + 1}</span>
                                    <div className="validator-info">
                                        <span className="validator-address">{v.address.slice(0, 12)}...{v.address.slice(-8)}</span>
                                        <span className="validator-stake">{v.stake.toLocaleString()} EDU</span>
                                    </div>
                                    <div className="validator-stats">
                                        <span>{v.blocksCreated} blocks</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
};
