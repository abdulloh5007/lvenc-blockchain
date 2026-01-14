import React, { useState, useRef, useEffect } from 'react';
import { X, Download, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from './Button';
import { useI18n } from '../contexts';
import wordlist from '../data/wordlist.json';
import './SeedImportModal.css';

interface SeedImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImport: (mnemonic: string) => Promise<void>;
}

const WORD_COUNT = 15;

export const SeedImportModal: React.FC<SeedImportModalProps> = ({ isOpen, onClose, onImport }) => {
    const { t } = useI18n();
    const [words, setWords] = useState<string[]>(Array(WORD_COUNT).fill(''));
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    useEffect(() => {
        if (isOpen) {
            setWords(Array(WORD_COUNT).fill(''));
            setError(null);
            setTimeout(() => inputRefs.current[0]?.focus(), 100);
        }
    }, [isOpen]);

    const validateWord = (word: string): boolean => {
        return wordlist.includes(word.toLowerCase().trim());
    };

    const handlePaste = async (index: number, e: React.ClipboardEvent) => {
        const pastedText = e.clipboardData.getData('text').trim();
        const pastedWords = pastedText.split(/\s+/).filter(w => w.length > 0);

        if (pastedWords.length === WORD_COUNT && index === 0) {
            e.preventDefault();
            setWords(pastedWords.map(w => w.toLowerCase()));
            inputRefs.current[WORD_COUNT - 1]?.focus();
        } else if (pastedWords.length > 1) {
            e.preventDefault();
            const newWords = [...words];
            pastedWords.forEach((word, i) => {
                if (index + i < WORD_COUNT) {
                    newWords[index + i] = word.toLowerCase();
                }
            });
            setWords(newWords);
            const nextIndex = Math.min(index + pastedWords.length, WORD_COUNT - 1);
            inputRefs.current[nextIndex]?.focus();
        }
    };

    const handleChange = (index: number, value: string) => {
        const newWords = [...words];
        newWords[index] = value.toLowerCase().trim();
        setWords(newWords);
        setError(null);
    };

    const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
        if (e.key === ' ' || e.key === 'Tab') {
            if (words[index] && index < WORD_COUNT - 1) {
                e.preventDefault();
                inputRefs.current[index + 1]?.focus();
            }
        } else if (e.key === 'Backspace' && !words[index] && index > 0) {
            e.preventDefault();
            inputRefs.current[index - 1]?.focus();
        } else if (e.key === 'Enter') {
            handleImport();
        }
    };

    const handleImport = async () => {
        const filledWords = words.filter(w => w.trim());
        if (filledWords.length !== WORD_COUNT) {
            setError(t('wallet.fillAllWords'));
            return;
        }

        const invalidWords = words.filter(w => !validateWord(w));
        if (invalidWords.length > 0) {
            setError(`${t('wallet.invalidWords')}: ${invalidWords.join(', ')}`);
            return;
        }

        setLoading(true);
        try {
            await onImport(words.join(' '));
            onClose();
        } catch (err) {
            setError(t('wallet.invalidMnemonic'));
        }
        setLoading(false);
    };

    const isComplete = words.every(w => w.trim() && validateWord(w));

    if (!isOpen) return null;

    return (
        <div className="seed-modal-overlay" onClick={onClose}>
            <div className="seed-modal" onClick={e => e.stopPropagation()}>
                <div className="seed-modal-header">
                    <h2><Download size={24} /> {t('wallet.importWallet')}</h2>
                    <button className="close-btn" onClick={onClose}><X size={20} /></button>
                </div>

                <p className="seed-modal-desc">{t('wallet.enterSeedWords')}</p>

                <div className="seed-grid">
                    {words.map((word, index) => (
                        <div key={index} className={`seed-input-wrapper ${word && !validateWord(word) ? 'invalid' : ''} ${word && validateWord(word) ? 'valid' : ''}`}>
                            <span className="seed-num">{index + 1}</span>
                            <input
                                ref={el => { inputRefs.current[index] = el; }}
                                type="text"
                                value={word}
                                onChange={e => handleChange(index, e.target.value)}
                                onPaste={e => handlePaste(index, e)}
                                onKeyDown={e => handleKeyDown(index, e)}
                                placeholder=""
                                autoComplete="off"
                                autoCorrect="off"
                                autoCapitalize="off"
                                spellCheck={false}
                            />
                            {word && validateWord(word) && <CheckCircle size={14} className="word-valid-icon" />}
                            {word && !validateWord(word) && <AlertCircle size={14} className="word-invalid-icon" />}
                        </div>
                    ))}
                </div>

                {error && <div className="seed-error"><AlertCircle size={16} /> {error}</div>}

                <div className="seed-modal-actions">
                    <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
                    <Button onClick={handleImport} loading={loading} disabled={!isComplete}>
                        <Download size={16} /> {t('wallet.import')}
                    </Button>
                </div>

                <p className="seed-hint">{t('wallet.pasteHint')}</p>
            </div>
        </div>
    );
};
