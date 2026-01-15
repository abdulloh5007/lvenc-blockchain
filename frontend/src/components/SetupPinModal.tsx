import React, { useState } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { Button } from './Button';
import './PinModal.css';

interface SetupPinModalProps {
    onComplete: (pin: string) => void;
}

export const SetupPinModal: React.FC<SetupPinModalProps> = ({ onComplete }) => {
    const [pin, setPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [showPin, setShowPin] = useState(false);
    const [error, setError] = useState('');
    const [step, setStep] = useState<'create' | 'confirm'>('create');

    const handlePinChange = (value: string) => {
        // Only allow digits, max 6
        const cleaned = value.replace(/\D/g, '').slice(0, 6);
        if (step === 'create') {
            setPin(cleaned);
            setError('');
        } else {
            setConfirmPin(cleaned);
            setError('');
        }
    };

    const handleNext = () => {
        if (pin.length < 4) {
            setError('PIN должен быть минимум 4 цифры');
            return;
        }
        setStep('confirm');
    };

    const handleConfirm = () => {
        if (confirmPin !== pin) {
            setError('PIN не совпадает');
            setConfirmPin('');
            return;
        }
        onComplete(pin);
    };

    return (
        <div className="pin-modal-overlay">
            <div className="pin-modal">
                <div className="pin-modal-header">
                    <Lock size={48} className="pin-icon" />
                    <h2>{step === 'create' ? 'Создайте PIN' : 'Подтвердите PIN'}</h2>
                    <p>
                        {step === 'create'
                            ? 'PIN защитит ваши кошельки'
                            : 'Введите PIN ещё раз'}
                    </p>
                </div>

                <div className="pin-input-container">
                    <div className="pin-input-wrapper">
                        <input
                            type={showPin ? 'text' : 'password'}
                            value={step === 'create' ? pin : confirmPin}
                            onChange={e => handlePinChange(e.target.value)}
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
                                className={`pin-dot ${(step === 'create' ? pin : confirmPin).length > i ? 'filled' : ''}`}
                            />
                        ))}
                    </div>
                    {error && <p className="pin-error">{error}</p>}
                </div>

                <div className="pin-modal-actions">
                    {step === 'create' ? (
                        <Button
                            onClick={handleNext}
                            disabled={pin.length < 4}
                            variant="primary"
                            className="pin-btn"
                        >
                            Далее
                        </Button>
                    ) : (
                        <>
                            <Button
                                onClick={() => { setStep('create'); setConfirmPin(''); }}
                                variant="ghost"
                            >
                                Назад
                            </Button>
                            <Button
                                onClick={handleConfirm}
                                disabled={confirmPin.length < 4}
                                variant="primary"
                            >
                                Подтвердить
                            </Button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
