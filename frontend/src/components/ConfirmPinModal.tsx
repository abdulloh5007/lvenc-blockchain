import React, { useState } from 'react';
import { Shield, Eye, EyeOff } from 'lucide-react';
import { Button } from './Button';
import './PinModal.css';

interface ConfirmPinModalProps {
    title?: string;
    description?: string;
    onConfirm: (pin: string) => boolean;
    onCancel: () => void;
}

export const ConfirmPinModal: React.FC<ConfirmPinModalProps> = ({
    title = 'Подтвердите действие',
    description = 'Введите PIN для подтверждения транзакции',
    onConfirm,
    onCancel
}) => {
    const [pin, setPin] = useState('');
    const [showPin, setShowPin] = useState(false);
    const [error, setError] = useState('');

    const handlePinChange = (value: string) => {
        const cleaned = value.replace(/\D/g, '').slice(0, 6);
        setPin(cleaned);
        setError('');
    };

    const handleConfirm = () => {
        if (pin.length < 4) {
            setError('Введите PIN');
            return;
        }

        const success = onConfirm(pin);
        if (!success) {
            setError('Неверный PIN');
            setPin('');
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && pin.length >= 4) {
            handleConfirm();
        }
        if (e.key === 'Escape') {
            onCancel();
        }
    };

    return (
        <div className="pin-modal-overlay">
            <div className="pin-modal confirm-modal">
                <div className="pin-modal-header">
                    <Shield size={48} className="pin-icon confirm-icon" />
                    <h2>{title}</h2>
                    <p>{description}</p>
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

                <div className="pin-modal-actions two-buttons">
                    <Button onClick={onCancel} variant="ghost">
                        Отмена
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={pin.length < 4}
                        variant="primary"
                    >
                        Подтвердить
                    </Button>
                </div>
            </div>
        </div>
    );
};
