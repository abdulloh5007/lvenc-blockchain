import React, { useState, useRef, useEffect } from 'react';
import { X, Download, AlertCircle } from 'lucide-react';
import { Button } from './Button';
import { useI18n } from '../contexts';
import wordlist from '../data/wordlist.json';
import './SeedImportModal.css';

interface SeedImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImport: (mnemonic: string) => Promise<void>;
}

type WordMode = 12 | 24;
const MAX_SUGGESTIONS = 3;

export const SeedImportModal: React.FC<SeedImportModalProps> = ({ isOpen, onClose, onImport }) => {
    const { t } = useI18n();
    const [wordMode, setWordMode] = useState<WordMode>(24);
    const [words, setWords] = useState<string[]>(Array(24).fill(''));
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeIndex, setActiveIndex] = useState<number | null>(null);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    useEffect(() => {
        if (isOpen) {
            setWords(Array(wordMode).fill(''));
            setError(null);
            setSuggestions([]);
            setActiveIndex(null);
            setTimeout(() => inputRefs.current[0]?.focus(), 100);
        }
    }, [isOpen, wordMode]);

    // Switch between 12 and 24 word modes
    const handleModeChange = (newMode: WordMode) => {
        if (newMode !== wordMode) {
            setWordMode(newMode);
            setWords(Array(newMode).fill(''));
            setError(null);
            setSuggestions([]);
            setActiveIndex(null);
        }
    };

    // Get autocomplete suggestions
    const getSuggestions = (input: string): string[] => {
        if (!input || input.length < 1) return [];
        const lower = input.toLowerCase();
        return wordlist
            .filter(w => w.startsWith(lower))
            .slice(0, MAX_SUGGESTIONS);
    };

    const handlePaste = async (index: number, e: React.ClipboardEvent) => {
        const pastedText = e.clipboardData.getData('text').trim();
        const pastedWords = pastedText.split(/\s+/).filter(w => w.length > 0);

        // Auto-detect word count and switch mode if pasting full mnemonic
        if ((pastedWords.length === 12 || pastedWords.length === 24) && index === 0) {
            e.preventDefault();
            const detectedMode = pastedWords.length as WordMode;
            setWordMode(detectedMode);
            setWords(pastedWords.map(w => w.toLowerCase()));
            setTimeout(() => {
                inputRefs.current[detectedMode - 1]?.focus();
            }, 100);
            setSuggestions([]);
        } else if (pastedWords.length > 1) {
            e.preventDefault();
            const newWords = [...words];
            pastedWords.forEach((word, i) => {
                if (index + i < wordMode) {
                    newWords[index + i] = word.toLowerCase();
                }
            });
            setWords(newWords);
            const nextIndex = Math.min(index + pastedWords.length, wordMode - 1);
            inputRefs.current[nextIndex]?.focus();
            setSuggestions([]);
        }
    };

    const handleChange = (index: number, value: string) => {
        const newWords = [...words];
        newWords[index] = value.toLowerCase();
        setWords(newWords);
        setError(null);
        setActiveIndex(index);

        const trimmedValue = value.trim();
        const newSuggestions = getSuggestions(trimmedValue);
        setSuggestions(newSuggestions);
    };

    const handleFocus = (index: number) => {
        setActiveIndex(index);
        const trimmedValue = words[index]?.trim() || '';
        setSuggestions(getSuggestions(trimmedValue));
    };

    const handleBlur = () => {
        setTimeout(() => {
            setSuggestions([]);
        }, 200);
    };

    const selectSuggestion = (word: string) => {
        if (activeIndex !== null) {
            const newWords = [...words];
            newWords[activeIndex] = word;
            setWords(newWords);
            setSuggestions([]);

            if (activeIndex < wordMode - 1) {
                inputRefs.current[activeIndex + 1]?.focus();
            }
        }
    };

    const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
        if (e.key === ' ' || e.key === 'Tab') {
            if (words[index] && index < wordMode - 1) {
                e.preventDefault();
                inputRefs.current[index + 1]?.focus();
            }
        } else if (e.key === 'Backspace' && !words[index] && index > 0) {
            e.preventDefault();
            inputRefs.current[index - 1]?.focus();
        } else if (e.key === 'Enter') {
            if (suggestions.length > 0) {
                e.preventDefault();
                selectSuggestion(suggestions[0]);
            } else {
                handleImport();
            }
        }
    };

    const handleImport = async () => {
        const filledWords = words.filter(w => w.trim());
        if (filledWords.length !== wordMode) {
            setError(t('wallet.fillAllWords').replace('24', String(wordMode)));
            return;
        }

        // Validate all words
        const invalidWords = words.filter(w => !(wordlist as string[]).includes(w.toLowerCase().trim()));
        if (invalidWords.length > 0) {
            setError(t('wallet.invalidMnemonic'));
            return;
        }

        setLoading(true);
        try {
            await onImport(words.join(' '));
            onClose();
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : t('wallet.invalidMnemonic');
            setError(errorMsg);
        }
        setLoading(false);
    };

    const filledCount = words.filter(w => w.trim()).length;

    if (!isOpen) return null;

    // Split words into columns based on mode
    const firstColumn = wordMode === 24 ? words.slice(0, 12) : words.slice(0, 6);
    const secondColumn = wordMode === 24 ? words.slice(12, 24) : words.slice(6, 12);
    const firstColumnOffset = 0;
    const secondColumnOffset = wordMode === 24 ? 12 : 6;

    const renderInput = (word: string, index: number) => (
        <div key={index} className="seed-input-wrapper">
            <span className="seed-num">{index + 1}</span>
            <input
                ref={el => { inputRefs.current[index] = el; }}
                type="text"
                value={word}
                onChange={e => handleChange(index, e.target.value)}
                onPaste={e => handlePaste(index, e)}
                onKeyDown={e => handleKeyDown(index, e)}
                onFocus={() => handleFocus(index)}
                onBlur={handleBlur}
                placeholder=""
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
            />
            {activeIndex === index && suggestions.length > 0 && (
                <div className="seed-suggestions">
                    {suggestions.map((s, i) => (
                        <div
                            key={i}
                            className="seed-suggestion"
                            onMouseDown={() => selectSuggestion(s)}
                        >
                            {s}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    return (
        <div className="seed-modal-overlay" onClick={onClose}>
            <div className="seed-modal" onClick={e => e.stopPropagation()}>
                <div className="seed-modal-header">
                    <h2><Download size={24} /> {t('wallet.importWallet')}</h2>
                    <button className="close-btn" onClick={onClose}><X size={20} /></button>
                </div>

                {/* Mode Tabs */}
                <div className="seed-mode-tabs">
                    <button
                        className={`seed-mode-tab ${wordMode === 24 ? 'active' : ''}`}
                        onClick={() => handleModeChange(24)}
                    >
                        24 {t('wallet.words') || 'слова'}
                    </button>
                    <button
                        className={`seed-mode-tab ${wordMode === 12 ? 'active' : ''}`}
                        onClick={() => handleModeChange(12)}
                    >
                        12 {t('wallet.words') || 'слов'}
                    </button>
                </div>

                <p className="seed-modal-desc">
                    {t('wallet.enterSeedWords')} ({wordMode} {t('wallet.words') || 'слов'})
                </p>

                <div className="seed-grid-columns">
                    <div className="seed-column">
                        {firstColumn.map((word, index) => renderInput(word, index + firstColumnOffset))}
                    </div>
                    <div className="seed-column">
                        {secondColumn.map((word, index) => renderInput(word, index + secondColumnOffset))}
                    </div>
                </div>

                {error && <div className="seed-error"><AlertCircle size={16} /> {error}</div>}

                <div className="seed-modal-actions">
                    <span className="seed-progress">{filledCount}/{wordMode}</span>
                    <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
                    <Button onClick={handleImport} loading={loading}>
                        <Download size={16} /> {t('wallet.import')}
                    </Button>
                </div>

                <p className="seed-hint">{t('wallet.pasteHint')}</p>
            </div>
        </div>
    );
};
