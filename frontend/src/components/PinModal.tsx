import React, { useState, useEffect } from 'react';
import { Delete } from 'lucide-react';
import * as encryption from '../utils/encryption';
import './PinModal.css';

interface PinModalProps {
    isOpen: boolean;
    onClose: () => void;
    mode?: 'setup' | 'unlock' | 'confirm';
    onSuccess?: () => void;
    onSetPin?: (pin: string) => void;
    onUnlock?: (pin: string) => boolean;
    title?: string;
    description?: string;
}

/**
 * Universal PinModal Component
 * 
 * Handles:
 * 1. Setup: Create -> Confirm -> Save (via onSetPin callback)
 * 2. Unlock: Enter -> Verify -> Unlock (via onUnlock callback)
 * 3. Confirm: Enter -> Verify -> Callback
 * 
 * Note: Does NOT use usePinContext to avoid circular dependency when used inside PinProvider
 */
export const PinModal: React.FC<PinModalProps> = ({
    isOpen,
    onClose,
    mode = 'setup',
    onSuccess,
    onSetPin,
    onUnlock,
    title,
    description
}) => {
    // State
    const [pin, setPinValue] = useState<string>('');
    const [tempPin, setTempPin] = useState<string>('');
    const [stage, setStage] = useState<'create' | 'confirm'>('create');
    const [isError, setIsError] = useState<boolean>(false);
    const [shaking, setShaking] = useState<boolean>(false);
    const [activeKey, setActiveKey] = useState<string | null>(null);

    // Computed display text
    const getTitle = () => {
        if (title) return title;
        if (mode === 'setup') return stage === 'create' ? 'Создать PIN' : 'Подтвердить PIN';
        if (mode === 'unlock') return 'Введите PIN';
        if (mode === 'confirm') return 'Подтвердите действие';
        return 'Введите PIN';
    };

    const getSubtitle = () => {
        if (description) return description;
        if (mode === 'setup') return stage === 'create'
            ? 'Создайте PIN-код для защиты кошелька'
            : 'Введите PIN-код ещё раз';
        if (mode === 'unlock') return 'Введите PIN для разблокировки';
        if (mode === 'confirm') return 'Введите PIN для подтверждения';
        return '';
    };

    // Reset state
    useEffect(() => {
        if (isOpen) {
            setPinValue('');
            setTempPin('');
            setStage('create');
            setIsError(false);
            setShaking(false);
            setActiveKey(null);
        }
    }, [isOpen, mode]);

    const handleDigit = (digit: string) => {
        setPinValue(prev => {
            if (prev.length < 4) {
                setIsError(false);
                return prev + digit;
            }
            return prev;
        });
    };

    const handleDelete = () => {
        setPinValue(prev => prev.slice(0, -1));
        setIsError(false);
    };

    const triggerError = () => {
        setIsError(true);
        setShaking(true);
        if (navigator.vibrate) navigator.vibrate(200);
        setTimeout(() => {
            setShaking(false);
            setPinValue('');
            setIsError(false);
        }, 500);
    };

    const handleComplete = () => {
        // 1. SETUP MODE
        if (mode === 'setup') {
            if (stage === 'create') {
                if (pin.length === 4) {
                    setTempPin(pin);
                    setPinValue('');
                    setStage('confirm');
                }
            } else {
                if (pin === tempPin) {
                    onSetPin?.(pin);
                    onSuccess?.();
                    onClose();
                } else {
                    triggerError();
                }
            }
            return;
        }

        // 2. UNLOCK MODE
        if (mode === 'unlock') {
            const success = onUnlock?.(pin) ?? false;
            if (success) {
                onSuccess?.();
            } else {
                triggerError();
            }
            return;
        }

        // 3. CONFIRM MODE
        if (mode === 'confirm') {
            const isValid = encryption.verifyPin(pin);
            if (isValid) {
                onSuccess?.();
                onClose();
            } else {
                triggerError();
            }
            return;
        }
    };

    const isButtonActive = pin.length === 4;

    const handleAction = () => {
        if (isButtonActive) handleComplete();
    };

    // Keyboard support with visual feedback
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key >= '0' && e.key <= '9') {
                setActiveKey(e.key);
                handleDigit(e.key);
            } else if (e.key === 'Backspace') {
                setActiveKey('Backspace');
                handleDelete();
            } else if (e.key === 'Enter') {
                if (isButtonActive) handleAction();
            } else if (e.key === 'Escape') {
                onClose();
            }
        };

        const handleKeyUp = () => {
            setActiveKey(null);
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [isOpen, pin, stage, tempPin, mode, isButtonActive]);

    if (!isOpen) return null;

    return (
        <div className={`pin-backdrop ${isOpen ? 'open' : ''}`} onClick={onClose}>
            <div
                className={`pin-modal ${shaking ? 'shake' : ''}`}
                onClick={e => e.stopPropagation()}
            >
                <div className="pin-content">
                    <h2 className="pin-title">{getTitle()}</h2>
                    <p className="pin-subtitle">{getSubtitle()}</p>

                    <div className="pin-dots">
                        {[0, 1, 2, 3].map((i) => (
                            <div
                                key={i}
                                className={`pin-dot ${i < pin.length ? 'filled' : ''} ${isError ? 'error' : ''}`}
                            />
                        ))}
                    </div>

                    <div className="pin-keypad">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                            <button
                                key={num}
                                className={`pin-key ${activeKey === num.toString() ? 'active-key' : ''}`}
                                onClick={() => handleDigit(num.toString())}
                            >
                                {num}
                            </button>
                        ))}
                        <div className="pin-key-empty" />
                        <button
                            className={`pin-key ${activeKey === '0' ? 'active-key' : ''}`}
                            onClick={() => handleDigit('0')}
                        >
                            0
                        </button>
                        <button
                            className={`pin-key pin-key-delete ${activeKey === 'Backspace' ? 'active-key' : ''}`}
                            onClick={handleDelete}
                        >
                            <Delete size={24} />
                        </button>
                    </div>

                    <button
                        className={`pin-action-btn ${isButtonActive ? 'active' : ''}`}
                        onClick={handleAction}
                        disabled={!isButtonActive}
                    >
                        {mode === 'setup' && stage === 'create' ? 'Продолжить' : 'Подтвердить'}
                    </button>
                </div>
            </div>
        </div>
    );
};
