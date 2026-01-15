import React, { useState, useEffect, useRef } from 'react';
import { X, Download, Key, AlertCircle } from 'lucide-react';
import { Button } from './Button';
import { useI18n } from '../contexts';
import './SeedImportModal.css';
interface PrivateKeyImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImport: (privateKey: string, label?: string) => Promise<void>;
}
export const PrivateKeyImportModal: React.FC<PrivateKeyImportModalProps> = ({ isOpen, onClose, onImport }) => {
    const { t } = useI18n();
    const [privateKey, setPrivateKey] = useState('');
    const [label, setLabel] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    useEffect(() => {
        if (isOpen) {
            setPrivateKey('');
            setLabel('');
            setError(null);
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);
    const validateKey = (key: string): boolean => {
        return /^[a-fA-F0-9]{64}$/.test(key.trim());
    };
    const handleImport = async () => {
        const trimmedKey = privateKey.trim();
        if (!trimmedKey) {
            setError('Private key is required');
            return;
        }
        if (!validateKey(trimmedKey)) {
            setError('Invalid private key format (must be 64 hex characters)');
            return;
        }
        setLoading(true);
        try {
            await onImport(trimmedKey, label || 'Imported');
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Import failed');
        }
        setLoading(false);
    };
    if (!isOpen) return null;
    return (
        <div className="seed-modal-overlay" onClick={onClose}>
            <div className="seed-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                <div className="seed-modal-header">
                    <h2><Key size={24} /> {t('wallet.importWallet')}</h2>
                    <button className="close-btn" onClick={onClose}><X size={20} /></button>
                </div>
                <p className="seed-modal-desc">Enter your private key to import an existing wallet</p>
                <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                        Wallet Name (optional)
                    </label>
                    <input
                        type="text"
                        value={label}
                        onChange={e => setLabel(e.target.value)}
                        placeholder="My Imported Wallet"
                        style={{
                            width: '100%',
                            padding: '0.75rem',
                            borderRadius: '0.5rem',
                            border: '1px solid var(--border-color)',
                            background: 'var(--bg-secondary)',
                            color: 'var(--text-primary)',
                            fontSize: '1rem',
                        }}
                    />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                        Private Key (64 hex characters)
                    </label>
                    <textarea
                        ref={inputRef}
                        value={privateKey}
                        onChange={e => { setPrivateKey(e.target.value); setError(null); }}
                        placeholder="Enter your 64-character private key..."
                        rows={3}
                        style={{
                            width: '100%',
                            padding: '0.75rem',
                            borderRadius: '0.5rem',
                            border: `1px solid ${error ? 'var(--error)' : privateKey && validateKey(privateKey) ? 'var(--success)' : 'var(--border-color)'}`,
                            background: 'var(--bg-secondary)',
                            color: 'var(--text-primary)',
                            fontSize: '0.875rem',
                            fontFamily: 'monospace',
                            resize: 'none',
                        }}
                    />
                </div>
                {error && <div className="seed-error"><AlertCircle size={16} /> {error}</div>}
                <div className="seed-modal-actions">
                    <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
                    <Button onClick={handleImport} loading={loading} disabled={!privateKey.trim()}>
                        <Download size={16} /> {t('wallet.import')}
                    </Button>
                </div>
                <p className="seed-hint">Your private key is stored only in your browser's local storage</p>
            </div>
        </div>
    );
};
