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

const WORD_COUNT = 24;
const MAX_SUGGESTIONS = 3;

export const SeedImportModal: React.FC<SeedImportModalProps> = ({ isOpen, onClose, onImport }) => {
    const { t } = useI18n();
    const [words, setWords] = useState<string[]>(Array(WORD_COUNT).fill(''));
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeIndex, setActiveIndex] = useState<number | null>(null);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    useEffect(() => {
        if (isOpen) {
            setWords(Array(WORD_COUNT).fill(''));
            setError(null);
            setSuggestions([]);
            setActiveIndex(null);
            setTimeout(() => inputRefs.current[0]?.focus(), 100);
        }
    }, [isOpen]);

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

        if (pastedWords.length === WORD_COUNT && index === 0) {
            e.preventDefault();
            setWords(pastedWords.map(w => w.toLowerCase()));
            inputRefs.current[WORD_COUNT - 1]?.focus();
            setSuggestions([]);
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
            setSuggestions([]);
        }
    };

    const handleChange = (index: number, value: string) => {
        const newWords = [...words];
        // Don't trim during typing - only lowercase
        newWords[index] = value.toLowerCase();
        setWords(newWords);
        setError(null);

        // Always update activeIndex when typing
        setActiveIndex(index);

        // Update suggestions for current field
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
        // Delay to allow click on suggestion, but don't clear activeIndex
        // It will be set correctly by handleFocus when clicking another field
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

            // Move to next field
            if (activeIndex < WORD_COUNT - 1) {
                inputRefs.current[activeIndex + 1]?.focus();
            }
        }
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
            if (suggestions.length > 0) {
                e.preventDefault();
                selectSuggestion(suggestions[0]);
            } else {
                handleImport();
            }
        } else if (e.key === 'ArrowDown' && suggestions.length > 0) {
            e.preventDefault();
            // Could add keyboard navigation for suggestions
        }
    };

    const handleImport = async () => {
        const filledWords = words.filter(w => w.trim());
        if (filledWords.length !== WORD_COUNT) {
            setError(t('wallet.fillAllWords'));
            return;
        }

        // Validate all words at once
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

    // Split words into two columns: 1-12 and 13-24
    const firstColumn = words.slice(0, 12);
    const secondColumn = words.slice(12, 24);

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
            {/* Autocomplete suggestions dropdown */}
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

                <p className="seed-modal-desc">{t('wallet.enterSeedWords')}</p>

                <div className="seed-grid-columns">
                    <div className="seed-column">
                        {firstColumn.map((word, index) => renderInput(word, index))}
                    </div>
                    <div className="seed-column">
                        {secondColumn.map((word, index) => renderInput(word, index + 12))}
                    </div>
                </div>

                {error && <div className="seed-error"><AlertCircle size={16} /> {error}</div>}

                <div className="seed-modal-actions">
                    <span className="seed-progress">{filledCount}/{WORD_COUNT}</span>
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
