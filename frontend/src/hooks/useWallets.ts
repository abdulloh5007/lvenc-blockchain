import { useState, useEffect, useCallback } from 'react';
import { wallet, networkApi } from '../api/client';
import { usePinContext } from '../contexts';
import { ec as EC } from 'elliptic';
import { sha256 } from 'js-sha256';
import wordlist from '../data/wordlist.json';

const elliptic = new EC('secp256k1');
let addressPrefix = 'tEDU';

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

function generateMnemonic(wordCount: 12 | 24 = 24): string {
    const words: string[] = [];
    const array = new Uint32Array(wordCount);
    crypto.getRandomValues(array);
    for (let i = 0; i < wordCount; i++) {
        const index = array[i] % wordlist.length;
        words.push(wordlist[index]);
    }
    return words.join(' ');
}

function mnemonicToPrivateKey(mnemonic: string): string {
    return sha256(mnemonic);
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
    const words = mnemonic.trim().toLowerCase().split(/\s+/);
    // Support both 12 and 24 words for import
    if (words.length !== 12 && words.length !== 24) throw new Error('Mnemonic must be 12 or 24 words');
    const privateKey = mnemonicToPrivateKey(mnemonic.trim().toLowerCase());
    const keyPair = elliptic.keyFromPrivate(privateKey, 'hex');
    const publicKey = keyPair.getPublic('hex');
    const hash = sha256(publicKey);
    const address = addressPrefix + hash.substring(0, 40);
    return { address, publicKey, privateKey, mnemonic: mnemonic.trim().toLowerCase(), label, createdAt: Date.now() };
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
        const confirmed = await confirmPin('Подтвердите транзакцию', `Отправить ${amount} EDU?`);
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
