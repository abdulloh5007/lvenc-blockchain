import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { PinModal } from '../components/PinModal';
import * as encryption from '../utils/encryption';

interface PinContextType {
    isLocked: boolean;
    isSetup: boolean;
    unlock: (pin: string) => boolean;
    lock: () => void;
    setPin: (pin: string) => void;
    confirmPin: (title?: string, description?: string) => Promise<boolean>;
    getDecryptedData: () => string | null;
    saveData: (data: string) => boolean;
}

const PinContext = createContext<PinContextType | null>(null);

export function usePinContext() {
    const ctx = useContext(PinContext);
    if (!ctx) throw new Error('usePinContext must be used within PinProvider');
    return ctx;
}

interface PinProviderProps {
    children: ReactNode;
}

export const PinProvider: React.FC<PinProviderProps> = ({ children }) => {
    // Clear session on page load to force PIN re-entry
    // This runs once on initial mount (page load/refresh)
    useState(() => {
        // Always lock wallet on page load
        sessionStorage.removeItem('wallet_unlocked');
        sessionStorage.removeItem('wallet_pin');
        return true;
    });

    const [isSetup, setIsSetup] = useState(() => encryption.isWalletSetUp());
    const [isLocked, setIsLocked] = useState(true); // Always start locked
    const [decryptedData, setDecryptedData] = useState<string | null>(null);

    // Confirm PIN modal state
    const [confirmState, setConfirmState] = useState<{
        isOpen: boolean;
        resolve: ((value: boolean) => void) | null;
        title?: string;
        description?: string;
    }>({ isOpen: false, resolve: null });

    const handleSetPin = useCallback((pin: string) => {
        encryption.migrateToEncrypted(pin);
        setIsSetup(true);
        setIsLocked(false);
        setDecryptedData(encryption.unlockWallet(pin));
    }, []);

    const unlock = useCallback((pin: string): boolean => {
        const data = encryption.unlockWallet(pin);
        if (data !== null) {
            setIsLocked(false);
            setDecryptedData(data);
            return true;
        }
        return false;
    }, []);

    const lock = useCallback(() => {
        encryption.lockWallet();
        setIsLocked(true);
        setDecryptedData(null);
    }, []);

    const confirmPin = useCallback((title?: string, description?: string): Promise<boolean> => {
        return new Promise((resolve) => {
            setConfirmState({ isOpen: true, resolve, title, description });
        });
    }, []);

    const handleConfirmSuccess = useCallback(() => {
        if (confirmState.resolve) {
            confirmState.resolve(true);
        }
        setConfirmState(prev => ({ ...prev, isOpen: false, resolve: null }));
    }, [confirmState]);

    const handleConfirmClose = useCallback(() => {
        if (confirmState.resolve) {
            confirmState.resolve(false);
        }
        setConfirmState(prev => ({ ...prev, isOpen: false, resolve: null }));
    }, [confirmState]);

    const getDecryptedData = useCallback((): string | null => {
        return decryptedData;
    }, [decryptedData]);

    const saveData = useCallback((data: string): boolean => {
        const success = encryption.saveEncryptedData(data);
        if (success) {
            setDecryptedData(data);
        }
        return success;
    }, []);

    // Context value - memoize to prevent unnecessary re-renders
    const contextValue: PinContextType = {
        isLocked,
        isSetup,
        unlock,
        lock,
        setPin: handleSetPin,
        confirmPin,
        getDecryptedData,
        saveData
    };

    return (
        <PinContext.Provider value={contextValue}>
            {/* 1. Setup Modal (Force user to setup if not setup) */}
            <PinModal
                isOpen={!isSetup}
                onClose={() => { }}
                mode="setup"
                onSetPin={handleSetPin}
            />

            {/* 2. Unlock Modal (Force user to unlock if setup but locked) */}
            <PinModal
                isOpen={isSetup && isLocked}
                onClose={() => { }}
                mode="unlock"
                onUnlock={unlock}
                title="Разблокировать кошелёк"
            />

            {/* 3. Confirm Action Modal */}
            <PinModal
                isOpen={confirmState.isOpen}
                onClose={handleConfirmClose}
                mode="confirm"
                title={confirmState.title}
                description={confirmState.description}
                onSuccess={handleConfirmSuccess}
            />

            {/* Only render children if setup and unlocked */}
            {isSetup && !isLocked && children}
        </PinContext.Provider>
    );
};
