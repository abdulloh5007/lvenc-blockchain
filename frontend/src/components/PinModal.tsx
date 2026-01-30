import React, { useState, useEffect, useCallback } from 'react';
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

export const PinModal: React.FC<PinModalProps> = ({
    isOpen,
    onClose,
    mode = 'setup',
    onSuccess,
    onSetPin,
    onUnlock,
    title: _title,
    description
}) => {
    const [pin, setPinValue] = useState<string>('');
    const [tempPin, setTempPin] = useState<string>('');
    const [stage, setStage] = useState<'create' | 'confirm'>('create');
    const [isError, setIsError] = useState<boolean>(false);
    const [isSuccess, setIsSuccess] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [shaking, setShaking] = useState<boolean>(false);
    const [activeKey, setActiveKey] = useState<string | null>(null);
    const [processing, setProcessing] = useState<boolean>(false);

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
            setIsSuccess(false);
            setShaking(false);
            setActiveKey(null);
            setProcessing(false);
        }
    }, [isOpen, mode]);

    const triggerError = useCallback(() => {
        setIsError(true);
        setShaking(true);
        if (navigator.vibrate) navigator.vibrate(200);
        setTimeout(() => {
            setShaking(false);
            setPinValue('');
            setIsError(false);
        }, 500);
    }, []);

    const triggerSuccess = useCallback((callback: () => void) => {
        setProcessing(true);
        setIsLoading(true);

        // Show loading animation for 400ms
        setTimeout(() => {
            setIsLoading(false);
            setIsSuccess(true);

            // Show success state for 500ms before callback
            setTimeout(() => {
                callback();
            }, 500);
        }, 400);
    }, []);

    const handleComplete = useCallback((currentPin: string) => {
        if (processing) return;

        // 1. SETUP MODE
        if (mode === 'setup') {
            if (stage === 'create') {
                setTempPin(currentPin);
                setPinValue('');
                setStage('confirm');
                return;
            } else {
                if (currentPin === tempPin) {
                    triggerSuccess(() => {
                        onSetPin?.(currentPin);
                        onSuccess?.();
                        onClose();
                    });
                } else {
                    triggerError();
                }
            }
            return;
        }

        // 2. UNLOCK MODE
        if (mode === 'unlock') {
            const success = onUnlock?.(currentPin) ?? false;
            if (success) {
                triggerSuccess(() => {
                    onSuccess?.();
                });
            } else {
                triggerError();
            }
            return;
        }

        // 3. CONFIRM MODE
        if (mode === 'confirm') {
            const isValid = encryption.verifyPin(currentPin);
            if (isValid) {
                triggerSuccess(() => {
                    onSuccess?.();
                    onClose();
                });
            } else {
                triggerError();
            }
            return;
        }
    }, [mode, stage, tempPin, onSetPin, onSuccess, onClose, onUnlock, triggerError, triggerSuccess, processing]);

    // Auto-submit when 4 digits entered
    useEffect(() => {
        if (pin.length === 4 && !processing) {
            handleComplete(pin);
        }
    }, [pin, handleComplete, processing]);

    const handleDigit = (digit: string) => {
        if (processing) return;
        setPinValue(prev => {
            if (prev.length < 4) {
                setIsError(false);
                setIsSuccess(false);
                return prev + digit;
            }
            return prev;
        });
    };

    const handleDelete = () => {
        if (processing) return;
        setPinValue(prev => prev.slice(0, -1));
        setIsError(false);
        setIsSuccess(false);
    };

    // Keyboard support
    useEffect(() => {
        if (!isOpen || processing) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key >= '0' && e.key <= '9') {
                setActiveKey(e.key);
                handleDigit(e.key);
            } else if (e.key === 'Backspace') {
                setActiveKey('Backspace');
                handleDelete();
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
    }, [isOpen, processing]);

    if (!isOpen) return null;

    return (
        <div className={`pin-backdrop ${isOpen ? 'open' : ''}`} onClick={onClose}>
            <div
                className={`pin-modal ${shaking ? 'shake' : ''}`}
                onClick={e => e.stopPropagation()}
            >
                <div className="pin-content">
                    {/* <h2 className="pin-title">{getTitle()}</h2> */}
                    <p className="pin-subtitle">{getSubtitle()}</p>

                    <div className="pin-dots">
                        {[0, 1, 2, 3].map((i) => (
                            <div
                                key={i}
                                className={`pin-dot ${i < pin.length ? 'filled' : ''} ${isError ? 'error' : ''} ${isSuccess ? 'success' : ''} ${isLoading ? 'loading' : ''}`}
                            />
                        ))}
                    </div>

                    <div className="pin-keypad">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                            <button
                                key={num}
                                className={`pin-key ${activeKey === num.toString() ? 'active-key' : ''}`}
                                onClick={() => handleDigit(num.toString())}
                                disabled={processing}
                            >
                                {num}
                            </button>
                        ))}
                        <div className="pin-key-empty" />
                        <button
                            className={`pin-key ${activeKey === '0' ? 'active-key' : ''}`}
                            onClick={() => handleDigit('0')}
                            disabled={processing}
                        >
                            0
                        </button>
                        <button
                            className={`pin-key pin-key-delete ${activeKey === 'Backspace' ? 'active-key' : ''}`}
                            onClick={handleDelete}
                            disabled={processing}
                        >
                            <Delete size={24} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
