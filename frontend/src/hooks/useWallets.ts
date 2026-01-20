import { useState, useEffect, useCallback } from 'react';
import { wallet, networkApi } from '../api/client';
import { usePinContext } from '../contexts';
import { ec as EC } from 'elliptic';
import { sha256 } from 'js-sha256';
import * as bip39 from 'bip39';
import HDKey from 'hdkey';

const elliptic = new EC('secp256k1');
let addressPrefix = 'tLVE';

// BIP-44 derivation path (same as backend Wallet.ts)
const BIP44_PATH = "m/44'/60'/0'/0/0";

async function loadNetworkPrefix(): Promise<void> {
    try {
        const res = await networkApi.getInfo();
        if (res.success && res.data) {
            addressPrefix = res.data.addressPrefix;
        }
    } catch { }
}
loadNetworkPrefix();

export interface LocalWallet {
    address: string;
    publicKey: string;
    privateKey: string;
    mnemonic: string;
    label: string;
    createdAt: number;
}

/**
 * Generate BIP-39 mnemonic using proper entropy
 */
function generateMnemonic(wordCount: 12 | 24 = 24): string {
    const entropyBytes = wordCount === 12 ? 16 : 32;
    const entropy = new Uint8Array(entropyBytes);
    crypto.getRandomValues(entropy);
    return bip39.entropyToMnemonic(Buffer.from(entropy).toString('hex'));
}

/**
 * Derive private key from mnemonic using BIP-44 standard
 * MUST match backend Wallet.ts derivation exactly!
 */
function mnemonicToPrivateKey(mnemonic: string): string {
    const seed = bip39.mnemonicToSeedSync(mnemonic.trim());
    const hdkey = HDKey.fromMasterSeed(seed);
    const child = hdkey.derive(BIP44_PATH);
    if (!child.privateKey) {
        throw new Error('Failed to derive private key');
    }
    return child.privateKey.toString('hex');
}

function generateWallet(label: string = 'Wallet', wordCount: 12 | 24 = 24): LocalWallet {
    const mnemonic = generateMnemonic(wordCount);
    const privateKey = mnemonicToPrivateKey(mnemonic);
    const keyPair = elliptic.keyFromPrivate(privateKey, 'hex');
    const publicKey = keyPair.getPublic('hex');
    const hash = sha256(publicKey);
    const address = addressPrefix + hash.substring(0, 40);
    return { address, publicKey, privateKey, mnemonic, label, createdAt: Date.now() };
}

function importFromMnemonic(mnemonic: string, label: string = 'Imported'): LocalWallet {
    const trimmed = mnemonic.trim().toLowerCase();
    if (!bip39.validateMnemonic(trimmed)) {
        throw new Error('Invalid mnemonic phrase');
    }
    const privateKey = mnemonicToPrivateKey(trimmed);
    const keyPair = elliptic.keyFromPrivate(privateKey, 'hex');
    const publicKey = keyPair.getPublic('hex');
    const hash = sha256(publicKey);
    const address = addressPrefix + hash.substring(0, 40);
    return { address, publicKey, privateKey, mnemonic: trimmed, label, createdAt: Date.now() };
}

export interface WalletWithBalance extends LocalWallet {
    balance: number;
}

export function useWallets() {
    const { getDecryptedData, saveData, confirmPin } = usePinContext();
    const [wallets, setWallets] = useState<WalletWithBalance[]>([]);
    const [loading, setLoading] = useState(true);
    const [error] = useState<string | null>(null);

    // Load wallets from encrypted storage
    const loadWallets = useCallback((): LocalWallet[] => {
        try {
            const data = getDecryptedData();
            return data ? JSON.parse(data) : [];
        } catch {
            return [];
        }
    }, [getDecryptedData]);

    // Save wallets to encrypted storage
    const saveWallets = useCallback((walletList: LocalWallet[]): void => {
        saveData(JSON.stringify(walletList));
    }, [saveData]);

    const fetchBalances = useCallback(async () => {
        await loadNetworkPrefix();
        const stored = loadWallets();
        const withBalances: WalletWithBalance[] = await Promise.all(
            stored.map(async (w) => {
                const res = await wallet.getBalance(w.address);
                return { ...w, balance: res.data?.balance || 0 };
            })
        );
        setWallets(withBalances);
        setLoading(false);
    }, [loadWallets]);

    const createWallet = useCallback(async (label?: string, wordCount: 12 | 24 = 24) => {
        await loadNetworkPrefix();
        const newWallet = generateWallet(label, wordCount);
        const stored = loadWallets();
        stored.push(newWallet);
        saveWallets(stored);
        await fetchBalances();
        return newWallet;
    }, [loadWallets, saveWallets, fetchBalances]);

    const importWallet = useCallback(async (mnemonic: string, label?: string) => {
        await loadNetworkPrefix();
        const imported = importFromMnemonic(mnemonic, label);
        const stored = loadWallets();
        if (stored.find(w => w.address === imported.address)) {
            throw new Error('Wallet already exists');
        }
        stored.push(imported);
        saveWallets(stored);
        await fetchBalances();
        return imported;
    }, [loadWallets, saveWallets, fetchBalances]);

    const deleteWallet = useCallback((address: string) => {
        const stored = loadWallets();
        const filtered = stored.filter(w => w.address !== address);
        saveWallets(filtered);
        setWallets(prev => prev.filter(w => w.address !== address));
    }, [loadWallets, saveWallets]);

    const signTransaction = useCallback((from: string, to: string, amount: number, fee: number, timestamp: number) => {
        const stored = loadWallets();
        const w = stored.find(w => w.address === from);
        if (!w) throw new Error('Wallet not found');
        // Hash format must match backend Transaction.calculateHash(): from + to + amount + fee + timestamp
        const txData = from + to + amount.toString() + fee.toString() + timestamp.toString();
        const hash = sha256(txData);
        const keyPair = elliptic.keyFromPrivate(w.privateKey, 'hex');
        const signature = keyPair.sign(hash).toDER('hex');
        return { hash, signature, publicKey: w.publicKey, timestamp };
    }, [loadWallets]);

    // Require PIN confirmation before sending transaction
    const signTransactionWithPin = useCallback(async (
        from: string,
        to: string,
        amount: number,
        fee: number,
        timestamp: number
    ): Promise<{ hash: string; signature: string; publicKey: string; timestamp: number } | null> => {
        const confirmed = await confirmPin('Подтвердите транзакцию', `Отправить ${amount} LVE?`);
        if (!confirmed) return null;
        return signTransaction(from, to, amount, fee, timestamp);
    }, [confirmPin, signTransaction]);

    useEffect(() => {
        fetchBalances();
        const interval = setInterval(fetchBalances, 10000);
        return () => clearInterval(interval);
    }, [fetchBalances]);

    return {
        wallets,
        loading,
        error,
        createWallet,
        importWallet,
        deleteWallet,
        signTransaction,
        signTransactionWithPin,
        refresh: fetchBalances
    };
}
