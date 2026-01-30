import React, { useState, useEffect } from 'react';
import { Coins, Users, Lock, Unlock, Award, TrendingUp, Clock, GitBranch, RefreshCw } from 'lucide-react';
import { Card, Button, CustomSelect } from '../components';
import { useWallets } from '../hooks';
import { useI18n } from '../contexts';
import { staking, type ValidatorInfo, type EpochInfo, type Delegation } from '../api/client';
import './Staking.css';

interface UserStakeInfo {
    stake: number;
    pendingStake: number;
    delegations: Delegation[];
    totalDelegated: number;
    isValidator: boolean;
}

export const StakingPage: React.FC = () => {
    const { wallets, refresh, signStakingTransactionWithPin } = useWallets();
    const { t } = useI18n();
    const [selectedWallet, setSelectedWallet] = useState('');
    const [stakeAmount, setStakeAmount] = useState('100');
    const [unstakeAmount, setUnstakeAmount] = useState('');
    const [delegateAmount, setDelegateAmount] = useState('10');
    const [selectedValidator, setSelectedValidator] = useState('');
    const [loading, setLoading] = useState(false);
    const [validators, setValidators] = useState<(ValidatorInfo & { totalWeight?: number })[]>([]);
    const [totalStaked, setTotalStaked] = useState(0);
    const [totalDelegated, setTotalDelegated] = useState(0);
    const [userStakeInfo, setUserStakeInfo] = useState<UserStakeInfo | null>(null);
    const [epochInfo, setEpochInfo] = useState<EpochInfo | null>(null);
    const [activeTab, setActiveTab] = useState<'stake' | 'delegate'>('stake');
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        loadData();
        const interval = setInterval(loadData, 30000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (selectedWallet) loadUserStake();
    }, [selectedWallet]);

    const loadData = async () => {
        const [validatorsRes, epochRes] = await Promise.all([
            staking.getValidators(),
            staking.getEpoch()
        ]);
        if (validatorsRes.success && validatorsRes.data) {
            setValidators(validatorsRes.data.validators);
            setTotalStaked(validatorsRes.data.totalStaked);
            setTotalDelegated(validatorsRes.data.totalDelegated || 0);
        }
        if (epochRes.success && epochRes.data) {
            setEpochInfo(epochRes.data);
        }
    };

    const loadUserStake = async () => {
        const res = await staking.getStake(selectedWallet);
        if (res.success && res.data) {
            setUserStakeInfo({
                stake: res.data.stake,
                pendingStake: res.data.pendingStake,
                delegations: res.data.delegations,
                totalDelegated: res.data.totalDelegated,
                isValidator: res.data.isValidator,
            });
        }
    };

    const handleStake = async () => {
        if (!selectedWallet || !stakeAmount) return;
        setLoading(true);
        setMessage(null);

        try {
            // Sign transaction with PIN confirmation (client-side signing)
            // New canonical format: sha256(chainId + txType + from + to + amount + fee + nonce)
            const signed = await signStakingTransactionWithPin(
                selectedWallet,
                'STAKE_POOL',
                Number(stakeAmount),
                0,
                'STAKE',  // txType for domain separation
                `Застейкать ${stakeAmount} LVE?`
            );
            if (!signed) {
                setLoading(false);
                return; // User cancelled PIN
            }

            // Send signed tx to API (API only relays to mempool)
            const res = await staking.stake(
                selectedWallet,
                Number(stakeAmount),
                signed.signature,
                signed.publicKey,
                signed.nonce,
                signed.chainId,
                signed.signatureScheme
            );
            if (res.success && res.data) {
                setMessage({ type: 'success', text: `✅ Staked ${stakeAmount} LVE (активно с эпохи ${res.data.effectiveEpoch})` });
                refresh();
                loadData();
                loadUserStake();
                // Real-time update: check again after 5 seconds when block should be created
                setTimeout(() => {
                    loadData();
                    loadUserStake();
                    refresh();
                }, 5000);
            } else {
                setMessage({ type: 'error', text: res.error || 'Staking failed' });
            }
        } catch (err) {
            setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Staking failed' });
        }
        setLoading(false);
    };

    const handleUnstake = async () => {
        if (!selectedWallet || !unstakeAmount) return;
        setLoading(true);
        setMessage(null);

        try {
            // Sign transaction with PIN confirmation
            const signed = await signStakingTransactionWithPin(
                selectedWallet,
                'STAKE_POOL',
                Number(unstakeAmount),
                0,
                'UNSTAKE',
                `Снять со стейкинга ${unstakeAmount} LVE?`
            );
            if (!signed) {
                setLoading(false);
                return; // User cancelled
            }

            const res = await staking.unstake(
                selectedWallet,
                Number(unstakeAmount),
                signed.signature,
                signed.publicKey,
                signed.nonce,
                signed.chainId,
                signed.signatureScheme
            );
            if (res.success && res.data) {
                setMessage({ type: 'success', text: `🔓 Unstake запрошен (доступно с эпохи ${res.data.effectiveEpoch})` });
                refresh();
                loadData();
                loadUserStake();
                setTimeout(() => { loadData(); loadUserStake(); refresh(); }, 5000);
            } else {
                setMessage({ type: 'error', text: res.error || 'Unstake failed' });
            }
        } catch (err) {
            setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Unstake failed' });
        }
        setLoading(false);
    };

    const handleClaim = async () => {
        if (!selectedWallet) return;
        setLoading(true);
        setMessage(null);

        try {
            // Sign transaction with PIN confirmation
            const signed = await signStakingTransactionWithPin(
                selectedWallet,
                'STAKE_POOL',
                0,  // CLAIM doesn't have amount
                0,
                'CLAIM',
                `Забрать доступные токены из unstake?`
            );
            if (!signed) {
                setLoading(false);
                return;
            }

            const res = await staking.claim(
                selectedWallet,
                signed.signature,
                signed.publicKey,
                signed.nonce,
                signed.chainId,
                signed.signatureScheme
            );
            if (res.success && res.data) {
                setMessage({ type: 'success', text: res.data.message });
                refresh();
                loadUserStake();
            } else {
                setMessage({ type: 'error', text: res.error || 'Claim failed' });
            }
        } catch (err) {
            setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Claim failed' });
        }
        setLoading(false);
    };

    const handleDelegate = async () => {
        if (!selectedWallet || !selectedValidator || !delegateAmount) return;
        setLoading(true);
        setMessage(null);

        try {
            // Sign transaction with PIN confirmation (client-side signing)
            // For DELEGATE tx, toAddress = validator address
            const signed = await signStakingTransactionWithPin(
                selectedWallet,
                selectedValidator,
                Number(delegateAmount),
                0,
                'DELEGATE',  // txType for domain separation
                `Делегировать ${delegateAmount} LVE валидатору?`
            );
            if (!signed) {
                setLoading(false);
                return; // User cancelled PIN
            }

            // Send signed tx to API (API only relays to mempool)
            const res = await staking.delegate(
                selectedWallet,
                selectedValidator,
                Number(delegateAmount),
                signed.signature,
                signed.publicKey,
                signed.nonce,
                signed.chainId,
                signed.signatureScheme
            );
            if (res.success && res.data) {
                setMessage({ type: 'success', text: `✅ Делегировано ${delegateAmount} LVE (активно с эпохи ${res.data.effectiveEpoch})` });
                refresh();
                loadData();
                loadUserStake();
            } else {
                setMessage({ type: 'error', text: res.error || 'Delegation failed' });
            }
        } catch (err) {
            setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Delegation failed' });
        }
        setLoading(false);
    };

    const handleUndelegate = async (validator: string, amount: number) => {
        if (!selectedWallet) return;
        setLoading(true);
        setMessage(null);

        try {
            // Sign transaction with PIN confirmation
            const signed = await signStakingTransactionWithPin(
                selectedWallet,
                validator,
                amount,
                0,
                'UNDELEGATE',
                `Отменить делегирование ${amount} LVE?`
            );
            if (!signed) {
                setLoading(false);
                return;
            }

            const res = await staking.undelegate(
                selectedWallet,
                validator,
                amount,
                signed.signature,
                signed.publicKey,
                signed.nonce,
                signed.chainId,
                signed.signatureScheme
            );
            if (res.success) {
                setMessage({ type: 'success', text: `🔓 Undelegated ${amount} LVE` });
                refresh();
                loadUserStake();
            } else {
                setMessage({ type: 'error', text: res.error || 'Undelegation failed' });
            }
        } catch (err) {
            setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Undelegation failed' });
        }
        setLoading(false);
    };

    return (
        <div className="staking-page fade-in">
            <div className="page-header">
                <h1><Coins className="header-icon" /> {t('staking.title')}</h1>
            </div>

            {/* Epoch Banner */}
            {epochInfo && (
                <Card className="epoch-banner">
                    <div className="epoch-info">
                        <div className="epoch-main">
                            <Clock size={20} />
                            <span className="epoch-label">Эпоха</span>
                            <span className="epoch-number">{epochInfo.currentEpoch}</span>
                        </div>
                        <div className="epoch-progress-container">
                            <div className="epoch-progress-bar">
                                <div className="epoch-progress-fill" style={{ width: `${epochInfo.progress}%` }} />
                            </div>
                            <span className="epoch-progress-text">{epochInfo.progress}%</span>
                        </div>
                        <div className="epoch-blocks">
                            <span>{epochInfo.blocksRemaining} блоков до следующей эпохи</span>
                        </div>
                    </div>
                </Card>
            )}

            <div className="staking-stats">
                <Card className="stat-card">
                    <TrendingUp size={24} />
                    <div className="stat-info">
                        <span className="stat-value">{totalStaked.toLocaleString()} LVE</span>
                        <span className="stat-label">{t('staking.totalStaked')}</span>
                    </div>
                </Card>
                <Card className="stat-card">
                    <GitBranch size={24} />
                    <div className="stat-info">
                        <span className="stat-value">{totalDelegated.toLocaleString()} LVE</span>
                        <span className="stat-label">Делегировано</span>
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
                        <span className="stat-value">10 LVE</span>
                        <span className="stat-label">{t('staking.reward')}</span>
                    </div>
                </Card>
            </div>

            <div className="staking-content">
                <Card className="staking-form-card">
                    {/* Wallet Selector */}
                    <div className="form-group">
                        <label>{t('wallet.selectWallet')}</label>
                        <CustomSelect
                            options={[
                                { value: '', label: `${t('wallet.selectWallet')}...` },
                                ...wallets.map(w => ({
                                    value: w.address,
                                    label: `${w.label || 'Wallet'} (${w.balance || 0} LVE)`
                                }))
                            ]}
                            value={selectedWallet}
                            onChange={setSelectedWallet}
                        />
                    </div>

                    {/* User Stake Info */}
                    {selectedWallet && userStakeInfo && (
                        <div className="user-stake-info">
                            <div className="stake-item">
                                <span>Ваш стейк:</span>
                                <strong>{userStakeInfo.stake} LVE</strong>
                            </div>
                            {userStakeInfo.pendingStake > 0 && (
                                <div className="stake-item pending">
                                    <span>Ожидает:</span>
                                    <strong>{userStakeInfo.pendingStake} LVE</strong>
                                </div>
                            )}
                            <div className="stake-item">
                                <span>Делегировано:</span>
                                <strong>{userStakeInfo.totalDelegated} LVE</strong>
                            </div>
                            {userStakeInfo.isValidator && (
                                <div className="validator-badge">✅ Вы валидатор</div>
                            )}
                        </div>
                    )}

                    {/* Tabs */}
                    <div className="tabs">
                        <button className={`tab ${activeTab === 'stake' ? 'active' : ''}`} onClick={() => setActiveTab('stake')}>
                            <Lock size={16} /> Стейкинг
                        </button>
                        <button className={`tab ${activeTab === 'delegate' ? 'active' : ''}`} onClick={() => setActiveTab('delegate')}>
                            <GitBranch size={16} /> Делегирование
                        </button>
                    </div>

                    {/* Stake Tab */}
                    {activeTab === 'stake' && (
                        <div className="tab-content">
                            <div className="form-group">
                                <label>Сумма стейка (мин 100 LVE)</label>
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
                                    <Lock size={16} /> Застейкать
                                </Button>
                            </div>

                            <hr className="divider" />

                            <div className="form-group">
                                <label>Сумма анстейка</label>
                                <input
                                    type="number"
                                    value={unstakeAmount}
                                    onChange={e => setUnstakeAmount(e.target.value)}
                                    placeholder="Сумма для вывода"
                                />
                            </div>
                            <div className="button-group">
                                <Button onClick={handleUnstake} disabled={loading || !selectedWallet || !unstakeAmount} variant="secondary">
                                    <Unlock size={16} /> Анстейк
                                </Button>
                                <Button onClick={handleClaim} disabled={loading || !selectedWallet} variant="ghost">
                                    <RefreshCw size={16} /> Забрать
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Delegate Tab */}
                    {activeTab === 'delegate' && (
                        <div className="tab-content">
                            <div className="form-group">
                                <label>Выберите валидатора</label>
                                <CustomSelect
                                    options={[
                                        { value: '', label: 'Выберите валидатора...' },
                                        ...validators.map(v => ({
                                            value: v.address,
                                            label: `${v.address.slice(0, 10)}... (${v.stake} LVE, ${v.commission || 10}% комиссия)`
                                        }))
                                    ]}
                                    value={selectedValidator}
                                    onChange={setSelectedValidator}
                                />
                            </div>
                            <div className="form-group">
                                <label>Сумма делегирования (мин 10 LVE)</label>
                                <input
                                    type="number"
                                    value={delegateAmount}
                                    onChange={e => setDelegateAmount(e.target.value)}
                                    min="10"
                                    placeholder="10"
                                />
                            </div>
                            <div className="button-group">
                                <Button onClick={handleDelegate} disabled={loading || !selectedWallet || !selectedValidator} variant="primary">
                                    <GitBranch size={16} /> Делегировать
                                </Button>
                            </div>

                            {/* Active Delegations */}
                            {userStakeInfo && userStakeInfo.delegations.length > 0 && (
                                <div className="delegations-list">
                                    <h4>Ваши делегации</h4>
                                    {userStakeInfo.delegations.map((d, i) => (
                                        <div key={i} className="delegation-item">
                                            <span>{d.validator.slice(0, 12)}...</span>
                                            <span className="delegation-amount">{d.amount} LVE</span>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => handleUndelegate(d.validator, d.amount)}
                                                disabled={loading}
                                            >
                                                <Unlock size={14} />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

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
                                        <span className="validator-stake">
                                            {v.stake.toLocaleString()} + {v.delegatedStake?.toLocaleString() || 0} LVE
                                        </span>
                                    </div>
                                    <div className="validator-stats">
                                        <span>{v.blocksCreated} блоков</span>
                                        <span>{v.commission || 10}% ком.</span>
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
