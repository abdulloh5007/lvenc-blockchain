import React, { useState, useEffect } from 'react';
import { Globe, Radio, Users, Plus, Link2, Monitor, BookOpen } from 'lucide-react';
import { Card, Button, Input } from '../components';
import { useI18n } from '../contexts';
import { network } from '../api/client';
import './Network.css';

export const NetworkPage: React.FC = () => {
    const { t } = useI18n();
    const [peers, setPeers] = useState<string[]>([]);
    const [peerCount, setPeerCount] = useState(0);
    const [peerUrl, setPeerUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        const fetchPeers = async () => {
            const res = await network.getPeers();
            if (res.success && res.data) {
                setPeers(res.data.peers);
                setPeerCount(res.data.count);
            }
        };
        fetchPeers();
        const interval = setInterval(fetchPeers, 5000);
        return () => clearInterval(interval);
    }, []);

    const handleConnect = async () => {
        if (!peerUrl) {
            setMessage({ type: 'error', text: t('common.error') });
            return;
        }
        setLoading(true);
        const res = await network.connect(peerUrl);
        if (res.success) {
            setMessage({ type: 'success', text: res.data?.message || t('common.success') });
            setPeerUrl('');
        } else {
            setMessage({ type: 'error', text: res.error || t('common.error') });
        }
        setLoading(false);
    };

    return (
        <div className="network-page fade-in">
            <div className="page-header">
                <h1><Globe className="header-icon" /> {t('network.title')}</h1>
                <p>{t('network.subtitle')}</p>
            </div>

            {message && (
                <div className={`message ${message.type}`}>
                    {message.text}
                    <button onClick={() => setMessage(null)}>×</button>
                </div>
            )}

            <div className="network-content">
                <Card title={t('network.status')} icon={<Radio size={20} />} className="status-card">
                    <div className="network-stats">
                        <div className="stat-item"><Link2 className="stat-icon-large" /><div className="stat-details"><span className="stat-value-large">{peerCount}</span><span className="stat-label-large">{t('network.connectedPeers')}</span></div></div>
                        <div className="stat-item"><Globe className="stat-icon-large" /><div className="stat-details"><span className="stat-value-large">P2P</span><span className="stat-label-large">{t('network.networkType')}</span></div></div>
                        <div className="stat-item"><Radio className="stat-icon-large" /><div className="stat-details"><span className="stat-value-large">6001</span><span className="stat-label-large">{t('network.wsPort')}</span></div></div>
                    </div>
                </Card>

                <Card title={t('network.peers')} icon={<Users size={20} />} className="peers-card">
                    {peers.length === 0 ? (
                        <div className="empty-state"><Link2 size={40} className="empty-icon" /><p>{t('network.noPeers')}</p></div>
                    ) : (
                        <div className="peers-list">
                            {peers.map((peer, i) => (
                                <div key={i} className="peer-item"><Monitor className="peer-avatar" /><div className="peer-info"><span className="peer-name">{peer}</span><span className="peer-status online">{t('common.connected')}</span></div></div>
                            ))}
                        </div>
                    )}
                </Card>

                <Card title={t('network.connect')} icon={<Plus size={20} />} className="connect-card">
                    <div className="connect-form">
                        <Input label={t('network.peerUrl')} placeholder="ws://192.168.1.100:6001" value={peerUrl} onChange={(e) => setPeerUrl(e.target.value)} />
                        <Button onClick={handleConnect} loading={loading}><Link2 size={16} /> {t('network.connect')}</Button>
                    </div>
                    <div className="connect-info">
                        <h4>{t('network.howToConnect')}:</h4>
                        <ol>
                            <li>{t('network.step1')}</li>
                            <li>{t('network.step2')}</li>
                            <li>{t('network.step3')}</li>
                            <li>{t('network.step4')}</li>
                        </ol>
                    </div>
                </Card>

                <Card title={t('network.aboutNetwork')} icon={<BookOpen size={20} />} className="about-card">
                    <div className="about-content"><p>{t('network.networkDesc')}</p></div>
                </Card>
            </div>
        </div>
    );
};
