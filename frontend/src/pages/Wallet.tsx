import React, { useState, useEffect } from 'react';
import { Wallet, Plus, Send, Droplets, Copy, AlertTriangle, Download } from 'lucide-react';
import { Card, Button, Input, SeedImportModal } from '../components';
import { useWallets } from '../hooks';
import { useI18n } from '../contexts';
import { faucet, transaction, blockchain } from '../api/client';
import type { FeeInfo } from '../api/client';
import './Wallet.css';

const formatAddress = (addr: string) => `${addr.substring(0, 12)}...${addr.substring(addr.length - 8)}`;

export const WalletPage: React.FC = () => {
    const { wallets, createWallet, importWallet, refresh } = useWallets();
    const { t } = useI18n();
    const [newWalletLabel, setNewWalletLabel] = useState('');
    const [createdWallet, setCreatedWallet] = useState<any>(null);
    const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [feeInfo, setFeeInfo] = useState<FeeInfo | null>(null);
    const [sendTo, setSendTo] = useState('');
    const [sendAmount, setSendAmount] = useState('');
    const [seedPhrase, setSeedPhrase] = useState('');
    const [showImportModal, setShowImportModal] = useState(false);

    useEffect(() => {
        if (selectedWallet) {
            const fetchFee = async () => {
                const res = await blockchain.getFee();
                if (res.success && res.data) setFeeInfo(res.data);
            };
            fetchFee();
            const interval = setInterval(fetchFee, 5000);
            return () => clearInterval(interval);
        }
    }, [selectedWallet]);

    const handleCreateWallet = async () => {
        setLoading(true);
        try {
            const result = await createWallet(newWalletLabel || undefined);
            setCreatedWallet(result);
            setNewWalletLabel('');
            setMessage({ type: 'success', text: t('wallet.walletCreated') });
        } catch {
            setMessage({ type: 'error', text: t('common.error') });
        }
        setLoading(false);
    };

    const handleImportWallet = async (mnemonic: string) => {
        await importWallet(mnemonic);
        setMessage({ type: 'success', text: t('wallet.walletImported') });
    };

    const handleFaucet = async (address: string) => {
        setLoading(true);
        const res = await faucet.request(address);
        if (res.success) {
            setMessage({ type: 'success', text: 'Received 100 EDU!' });
            refresh();
        } else {
            setMessage({ type: 'error', text: res.error || t('common.error') });
        }
        setLoading(false);
    };

    const handleSend = async () => {
        if (!selectedWallet || !sendTo || !sendAmount || !seedPhrase) {
            setMessage({ type: 'error', text: t('common.error') });
            return;
        }
        setLoading(true);
        const dynamicFee = feeInfo?.recommended || 0.1;
        const res = await transaction.send(selectedWallet, sendTo, parseFloat(sendAmount), seedPhrase.trim(), dynamicFee);
        if (res.success) {
            setMessage({ type: 'success', text: t('wallet.txSent') });
            setSendTo(''); setSendAmount(''); setSeedPhrase('');
            refresh();
        } else {
            setMessage({ type: 'error', text: res.error || t('common.error') });
        }
        setLoading(false);
    };

    return (
        <div className="wallet-page fade-in">
            <div className="page-header">
                <h1><Wallet className="header-icon" /> {t('wallet.title')}</h1>
                <p>{t('wallet.subtitle')}</p>
            </div>

            {message && (
                <div className={`message ${message.type}`}>
                    {message.text}
                    <button onClick={() => setMessage(null)}>×</button>
                </div>
            )}

            <div className="wallet-content">
                <div className="wallet-main">
                    <Card title={t('wallet.myWallets')} icon={<Wallet size={20} />}>
                        {wallets.length === 0 ? (
                            <p className="empty-state">{t('wallet.noWallets')}</p>
                        ) : (
                            <div className="wallets-list">
                                {wallets.map((w) => (
                                    <div key={w.address} className={`wallet-card ${selectedWallet === w.address ? 'selected' : ''}`} onClick={() => setSelectedWallet(w.address)}>
                                        <div className="wallet-avatar">{w.label?.[0]?.toUpperCase() || <Wallet size={20} />}</div>
                                        <div className="wallet-info">
                                            <div className="wallet-label">{w.label || 'Wallet'}</div>
                                            <div className="wallet-address font-mono">{formatAddress(w.address)}</div>
                                        </div>
                                        <div className="wallet-balance">
                                            <span className="balance-value">{w.balance?.toLocaleString() || 0}</span>
                                            <span className="balance-symbol">EDU</span>
                                        </div>
                                        <div className="wallet-actions">
                                            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(w.address); setMessage({ type: 'success', text: t('wallet.addressCopied') }); }} title={t('common.copy')}><Copy size={16} /></Button>
                                            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleFaucet(w.address); }} disabled={loading} title={t('wallet.faucet')}><Droplets size={16} /></Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>

                    {selectedWallet && (
                        <Card title={t('wallet.sendTransaction')} icon={<Send size={20} />} className="send-card">
                            <div className="send-form">
                                <div className="form-row"><span className="form-label">{t('transactions.from')}:</span><span className="font-mono">{formatAddress(selectedWallet)}</span></div>
                                <Input label={t('wallet.toAddress')} placeholder="EDU..." value={sendTo} onChange={(e) => setSendTo(e.target.value)} />
                                <Input label={t('wallet.amount')} type="number" placeholder="0" value={sendAmount} onChange={(e) => setSendAmount(e.target.value)} />
                                <div className={`auto-fee-info ${feeInfo?.congestion || 'low'}`}>
                                    <div className="fee-main"><span className="fee-label">{t('wallet.fee')}:</span><span className="fee-value">{feeInfo?.recommended || 0.1} EDU</span></div>
                                    <div className="fee-details">
                                        <span className={`congestion-badge ${feeInfo?.congestion || 'low'}`}>{feeInfo?.congestion === 'critical' ? '🔴' : feeInfo?.congestion === 'high' ? '🟠' : feeInfo?.congestion === 'medium' ? '🟡' : '🟢'}</span>
                                        <span className="fee-hint">({feeInfo?.pendingTransactions || 0} {t('wallet.pending')})</span>
                                    </div>
                                </div>
                                <div className="seed-input">
                                    <label>{t('wallet.seedPhrase')}</label>
                                    <textarea placeholder={t('wallet.enterSeed')} value={seedPhrase} onChange={(e) => setSeedPhrase(e.target.value)} rows={2} />
                                </div>
                                <Button onClick={handleSend} loading={loading}><Send size={16} /> {t('common.send')}</Button>
                            </div>
                        </Card>
                    )}
                </div>

                <div className="wallet-sidebar">
                    <Card title={t('wallet.createWallet')} icon={<Plus size={20} />}>
                        <div className="create-form">
                            <Input label={`${t('wallet.walletName')} (${t('wallet.optional')})`} placeholder="My Wallet" value={newWalletLabel} onChange={(e) => setNewWalletLabel(e.target.value)} />
                            <Button onClick={handleCreateWallet} loading={loading}><Plus size={16} /> {t('common.create')}</Button>
                        </div>
                    </Card>

                    <Card title={t('wallet.importWallet')} icon={<Download size={20} />}>
                        <Button variant="secondary" onClick={() => setShowImportModal(true)} className="full-width">
                            <Download size={16} /> {t('wallet.importBySeed')}
                        </Button>
                    </Card>

                    {createdWallet && (
                        <Card title={t('wallet.newWallet')} icon={<Wallet size={20} />} className="new-wallet-card">
                            <div className="new-wallet-info">
                                <div className="info-row"><span className="label">{t('wallet.address')}:</span><span className="value font-mono">{formatAddress(createdWallet.address)}</span></div>
                                <div className="warning-box"><AlertTriangle size={16} /> {t('wallet.saveSeed')}</div>
                                <div className="seed-phrase-box">
                                    <span className="label">{t('wallet.seedPhrase')} (15 {t('wallet.words')}):</span>
                                    <div className="seed-words">
                                        {createdWallet.mnemonic?.split(' ').map((word: string, i: number) => (
                                            <span key={i} className="seed-word"><span className="word-num">{i + 1}</span>{word}</span>
                                        ))}
                                    </div>
                                </div>
                                <Button variant="secondary" onClick={() => { navigator.clipboard.writeText(createdWallet.mnemonic || ''); setMessage({ type: 'success', text: t('wallet.seedCopied') }); }}><Copy size={16} /> {t('wallet.copySeed')}</Button>
                            </div>
                        </Card>
                    )}
                </div>
            </div>

            <SeedImportModal
                isOpen={showImportModal}
                onClose={() => setShowImportModal(false)}
                onImport={handleImportWallet}
            />
        </div>
    );
};
