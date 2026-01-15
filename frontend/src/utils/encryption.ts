import CryptoJS from 'crypto-js';

const STORAGE_KEY = 'wallet_encrypted';
const PIN_HASH_KEY = 'wallet_pin_hash';

/**
 * Hash PIN using SHA-256 (for verification, not storing plain PIN)
 */
export function hashPin(pin: string): string {
    return CryptoJS.SHA256(pin).toString();
}

/**
 * Encrypt data with PIN using AES-256
 */
export function encrypt(data: string, pin: string): string {
    return CryptoJS.AES.encrypt(data, pin).toString();
}

/**
 * Decrypt data with PIN using AES-256
 */
export function decrypt(encryptedData: string, pin: string): string | null {
    try {
        const bytes = CryptoJS.AES.decrypt(encryptedData, pin);
        const decrypted = bytes.toString(CryptoJS.enc.Utf8);
        if (!decrypted) return null;
        return decrypted;
    } catch {
        return null;
    }
}

/**
 * Check if wallet is set up (has PIN)
 */
export function isWalletSetUp(): boolean {
    return localStorage.getItem(PIN_HASH_KEY) !== null;
}

/**
 * Check if wallet is unlocked (has decrypted data in session)
 */
export function isWalletUnlocked(): boolean {
    return sessionStorage.getItem('wallet_unlocked') === 'true';
}

/**
 * Setup PIN for the first time
 */
export function setupPin(pin: string, initialData: string = '[]'): void {
    const pinHash = hashPin(pin);
    const encryptedData = encrypt(initialData, pin);
    localStorage.setItem(PIN_HASH_KEY, pinHash);
    localStorage.setItem(STORAGE_KEY, encryptedData);
    sessionStorage.setItem('wallet_unlocked', 'true');
    sessionStorage.setItem('wallet_pin', pin); // Keep in session for operations
}

/**
 * Verify PIN
 */
export function verifyPin(pin: string): boolean {
    const storedHash = localStorage.getItem(PIN_HASH_KEY);
    if (!storedHash) return false;
    return hashPin(pin) === storedHash;
}

/**
 * Unlock wallet with PIN and return decrypted data
 */
export function unlockWallet(pin: string): string | null {
    if (!verifyPin(pin)) return null;

    const encryptedData = localStorage.getItem(STORAGE_KEY);
    if (!encryptedData) return '[]';

    const decrypted = decrypt(encryptedData, pin);
    if (decrypted !== null) {
        sessionStorage.setItem('wallet_unlocked', 'true');
        sessionStorage.setItem('wallet_pin', pin);
    }
    return decrypted;
}

/**
 * Lock wallet (clear session)
 */
export function lockWallet(): void {
    sessionStorage.removeItem('wallet_unlocked');
    sessionStorage.removeItem('wallet_pin');
}

/**
 * Save encrypted wallet data (requires unlocked wallet)
 */
export function saveEncryptedData(data: string): boolean {
    const pin = sessionStorage.getItem('wallet_pin');
    if (!pin) return false;

    const encrypted = encrypt(data, pin);
    localStorage.setItem(STORAGE_KEY, encrypted);
    return true;
}

/**
 * Get current PIN from session (for transaction confirmation)
 */
export function getSessionPin(): string | null {
    return sessionStorage.getItem('wallet_pin');
}

/**
 * Migrate existing unencrypted wallets to encrypted storage
 */
export function migrateToEncrypted(pin: string): void {
    const existingWallets = localStorage.getItem('wallets');
    if (existingWallets) {
        setupPin(pin, existingWallets);
        localStorage.removeItem('wallets'); // Remove old unencrypted data
    } else {
        setupPin(pin, '[]');
    }
}
