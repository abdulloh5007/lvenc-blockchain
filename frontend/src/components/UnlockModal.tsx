import React, { useState } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { Button } from './Button';
import './PinModal.css';

interface UnlockModalProps {
    onUnlock: (pin: string) => boolean;
    onError?: () => void;
}

export const UnlockModal: React.FC<UnlockModalProps> = ({ onUnlock, onError }) => {
    const [pin, setPin] = useState('');
    const [showPin, setShowPin] = useState(false);
    const [error, setError] = useState('');
    const [attempts, setAttempts] = useState(0);

    const handlePinChange = (value: string) => {
        const cleaned = value.replace(/\D/g, '').slice(0, 6);
        setPin(cleaned);
        setError('');
    };

    const handleUnlock = () => {
        if (pin.length < 4) {
            setError('Введите PIN (4-6 цифр)');
            return;
        }

        const success = onUnlock(pin);
        if (!success) {
            setAttempts(prev => prev + 1);
            setError(`Неверный PIN (попытка ${attempts + 1}/5)`);
            setPin('');

            if (attempts >= 4) {
                onError?.();
            }
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && pin.length >= 4) {
            handleUnlock();
        }
    };

    return (
        <div className="pin-modal-overlay">
            <div className="pin-modal">
                <div className="pin-modal-header">
                    <Lock size={48} className="pin-icon" />
                    <h2>Разблокировать кошелёк</h2>
                    <p>Введите ваш PIN-код</p>
                </div>

                <div className="pin-input-container">
                    <div className="pin-input-wrapper">
                        <input
                            type={showPin ? 'text' : 'password'}
                            value={pin}
                            onChange={e => handlePinChange(e.target.value)}
                            onKeyPress={handleKeyPress}
                            placeholder="••••••"
                            className="pin-input"
                            maxLength={6}
                            autoFocus
                            inputMode="numeric"
                        />
                        <button
                            type="button"
                            className="pin-toggle"
                            onClick={() => setShowPin(!showPin)}
                        >
                            {showPin ? <EyeOff size={20} /> : <Eye size={20} />}
                        </button>
                    </div>
                    <div className="pin-dots">
                        {[...Array(6)].map((_, i) => (
                            <span
                                key={i}
                                className={`pin-dot ${pin.length > i ? 'filled' : ''}`}
                            />
                        ))}
                    </div>
                    {error && <p className="pin-error">{error}</p>}
                </div>

                <div className="pin-modal-actions">
                    <Button
                        onClick={handleUnlock}
                        disabled={pin.length < 4}
                        variant="primary"
                        className="pin-btn"
                    >
                        Разблокировать
                    </Button>
                </div>
            </div>
        </div>
    );
};
