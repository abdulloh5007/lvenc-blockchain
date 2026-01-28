import { useState, useEffect, useCallback } from 'react';
import { wallet, networkApi } from '../api/client';
import { usePinContext } from '../contexts';
import * as ed from '@noble/ed25519';
import { sha256 } from 'js-sha256';
import * as bip39 from 'bip39';
import HDKey from 'hdkey';

// Ed25519 is the ONLY accepted signature scheme
// secp256k1 is DEPRECATED
let addressPrefix = 'tLVE';

// BIP-44 derivation path for ed25519 (SLIP-0010)
// Using coin type 60 for backwards compatibility, but generating ed25519 keys
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
    // Use first 32 bytes as ed25519 private key seed
    return child.privateKey.toString('hex').slice(0, 64);
}

/**
 * Generate new ed25519 wallet from mnemonic
 * Returns async because ed25519 key derivation is async
 */
async function generateWalletAsync(label: string = 'Wallet', wordCount: 12 | 24 = 24): Promise<LocalWallet> {
    const mnemonic = generateMnemonic(wordCount);
    const privateKey = mnemonicToPrivateKey(mnemonic);

    // Get ed25519 public key from private key (32 bytes)
    const privateKeyBytes = hexToBytes(privateKey);
    const publicKeyBytes = await ed.getPublicKeyAsync(privateKeyBytes);
    const publicKey = bytesToHex(publicKeyBytes);

    // Create address from ed25519 public key (native format, NOT Ethereum-style)
    const hash = sha256(publicKey);
    const address = addressPrefix + hash.substring(0, 40);

    return { address, publicKey, privateKey, mnemonic, label, createdAt: Date.now() };
}

/**
 * Import wallet from existing mnemonic (ed25519)
 */
async function importFromMnemonicAsync(mnemonic: string, label: string = 'Imported'): Promise<LocalWallet> {
    const trimmed = mnemonic.trim().toLowerCase();
    if (!bip39.validateMnemonic(trimmed)) {
        throw new Error('Invalid mnemonic phrase');
    }
    const privateKey = mnemonicToPrivateKey(trimmed);

    // Get ed25519 public key from private key
    const privateKeyBytes = hexToBytes(privateKey);
    const publicKeyBytes = await ed.getPublicKeyAsync(privateKeyBytes);
    const publicKey = bytesToHex(publicKeyBytes);

    const hash = sha256(publicKey);
    const address = addressPrefix + hash.substring(0, 40);

    return { address, publicKey, privateKey, mnemonic: trimmed, label, createdAt: Date.now() };
}

// Helper functions for hex/bytes conversion
function hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
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
        const newWallet = await generateWalletAsync(label, wordCount);
        const stored = loadWallets();
        stored.push(newWallet);
        saveWallets(stored);
        await fetchBalances();
        return newWallet;
    }, [loadWallets, saveWallets, fetchBalances]);

    const importWallet = useCallback(async (mnemonic: string, label?: string) => {
        await loadNetworkPrefix();
        const imported = await importFromMnemonicAsync(mnemonic, label);
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

    /**
     * Sign transaction with ed25519 using canonical hash format
     * Canonical format: sha256(chainId + txType + from + to + amount + fee + nonce)
     * Note: timestamp is kept for legacy API compatibility but not used in signature
     */
    const signTransaction = useCallback(async (
        from: string,
        to: string,
        amount: number,
        fee: number,
        timestamp: number,
        nonce: number,
        chainId: string
    ) => {
        const stored = loadWallets();
        const w = stored.find(w => w.address === from);
        if (!w) throw new Error('Wallet not found');

        // Canonical hash format for replay protection
        const txType = 'TRANSFER';
        const txData = chainId + txType + from + to + amount.toString() + fee.toString() + nonce.toString();
        const hash = sha256(txData);

        // Sign with ed25519
        const privateKeyBytes = hexToBytes(w.privateKey);
        const hashBytes = hexToBytes(hash);
        const signatureBytes = await ed.signAsync(hashBytes, privateKeyBytes);
        const signature = bytesToHex(signatureBytes);

        return { hash, signature, publicKey: w.publicKey, timestamp };
    }, [loadWallets]);

    // Require PIN confirmation before sending transaction
    const signTransactionWithPin = useCallback(async (
        from: string,
        to: string,
        amount: number,
        fee: number,
        timestamp: number,
        nonce: number,
        chainId: string
    ): Promise<{ hash: string; signature: string; publicKey: string; timestamp: number } | null> => {
        const confirmed = await confirmPin('Подтвердите транзакцию', `Отправить ${amount} LVE?`);
        if (!confirmed) return null;
        return await signTransaction(from, to, amount, fee, timestamp, nonce, chainId);
    }, [confirmPin, signTransaction]);

    /**
     * Sign a staking transaction (STAKE, UNSTAKE, DELEGATE, UNDELEGATE)
     * Uses ed25519 signature (the ONLY accepted scheme)
     * 
     * CANONICAL HASH FORMAT (must match backend Transaction.calculateHash()):
     * hash = sha256(chainId + txType + from + to + amount + fee + nonce)
     * 
     * EXCLUDED: timestamp (non-deterministic), signature, id
     * 
     * @param nonce - Per-account sequence number (get from API before signing)
     * @param chainId - Network identifier (get from API)
     * @param txType - Transaction type for domain separation
     */
    const signStakingTransaction = useCallback(async (
        from: string,
        to: string,
        amount: number,
        fee: number,
        nonce: number,
        chainId: string,
        txType: 'STAKE' | 'UNSTAKE' | 'DELEGATE' | 'UNDELEGATE' | 'TRANSFER' | 'CLAIM' | 'COMMISSION'
    ): Promise<{ signature: string; publicKey: string; nonce: number; chainId: string; signatureScheme: 'ed25519' }> => {
        const stored = loadWallets();
        const w = stored.find(w => w.address === from);
        if (!w) throw new Error('Wallet not found');

        // Canonical tx hash: MUST match backend Transaction.calculateHash() EXACTLY
        // Format: sha256(chainId + txType + from + to + amount + fee + nonce)
        // NO timestamp in hash!
        const canonicalPayload =
            chainId +
            txType +
            from +
            to +
            amount.toString() +
            fee.toString() +
            nonce.toString();
        const txHash = sha256(canonicalPayload);  // Returns hex string

        // Sign with ed25519 (the ONLY accepted scheme)
        const privateKeyBytes = hexToBytes(w.privateKey);
        const hashBytes = hexToBytes(txHash);
        const signatureBytes = await ed.signAsync(hashBytes, privateKeyBytes);
        const signature = bytesToHex(signatureBytes);  // 64 bytes = 128 hex chars

        return {
            signature,
            publicKey: w.publicKey,  // 32 bytes = 64 hex chars
            nonce,
            chainId,
            signatureScheme: 'ed25519'
        };
    }, [loadWallets]);

    /**
     * Sign staking transaction with PIN confirmation
     * Fetches nonce and chainId from API, then signs with ed25519
     * Returns null if user cancels PIN
     */
    const signStakingTransactionWithPin = useCallback(async (
        from: string,
        to: string,
        amount: number,
        fee: number = 0,
        txType: 'STAKE' | 'UNSTAKE' | 'DELEGATE' | 'UNDELEGATE' | 'TRANSFER' | 'CLAIM' | 'COMMISSION',
        actionDescription?: string
    ): Promise<{ signature: string; publicKey: string; nonce: number; chainId: string; signatureScheme: 'ed25519' } | null> => {
        const description = actionDescription || `Подтвердите операцию: ${amount} LVE`;
        const confirmed = await confirmPin('Подтвердите транзакцию', description);
        if (!confirmed) return null;

        // Fetch nonce and chainId from API
        const [nonceRes, networkRes] = await Promise.all([
            networkApi.getNonce(from),
            networkApi.getInfo()
        ]);

        if (!nonceRes.success || !networkRes.success) {
            throw new Error('Failed to fetch nonce or network info');
        }

        const nonce = nonceRes.data!.nextNonce;
        const chainId = networkRes.data!.chainId;

        return await signStakingTransaction(from, to, amount, fee, nonce, chainId, txType);
    }, [confirmPin, signStakingTransaction]);

    /**
     * Sign an NFT transaction (MINT, TRANSFER)
     * Uses canonical hash format: sha256(chainId + txType + creator + tokenId + metadata)
     */
    const signNFTTransaction = useCallback(async (
        creator: string,
        txType: 'NFT_MINT' | 'NFT_TRANSFER',
        metadata: { name: string; description?: string; image: string },
        tokenId?: string,
        recipient?: string
    ): Promise<{
        signature: string;
        publicKey: string;
        nonce: number;
        chainId: string;
        signatureScheme: 'ed25519';
    }> => {
        const stored = loadWallets();
        const w = stored.find(w => w.address === creator);
        if (!w) throw new Error('Wallet not found');

        // Fetch nonce and chainId from API
        const nonceRes = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/nonce/${creator}`);
        const nonceData = await nonceRes.json();
        if (!nonceData.success) throw new Error('Failed to get nonce');
        const nonce = nonceData.data.nextNonce;

        const networkRes = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/network-info`);
        const networkData = await networkRes.json();
        if (!networkData.success) throw new Error('Failed to get network info');
        const chainId = networkData.data.chainId;

        // Canonical hash format for NFT transactions
        const canonicalPayload =
            chainId +
            txType +
            creator +
            (tokenId || 'NEW') +
            metadata.name +
            (recipient || '');
        const txHash = sha256(canonicalPayload);

        // Sign with ed25519
        const privateKeyBytes = hexToBytes(w.privateKey);
        const hashBytes = hexToBytes(txHash);
        const signatureBytes = await ed.signAsync(hashBytes, privateKeyBytes);
        const signature = bytesToHex(signatureBytes);

        return {
            signature,
            publicKey: w.publicKey,
            nonce,
            chainId,
            signatureScheme: 'ed25519'
        };
    }, [loadWallets]);

    /**
     * Sign NFT transaction with PIN confirmation
     */
    const signNFTTransactionWithPin = useCallback(async (
        creator: string,
        txType: 'NFT_MINT' | 'NFT_TRANSFER',
        metadata: { name: string; description?: string; image: string },
        confirmText: string,
        tokenId?: string,
        recipient?: string
    ): Promise<{
        signature: string;
        publicKey: string;
        nonce: number;
        chainId: string;
        signatureScheme: 'ed25519';
    } | null> => {
        const confirmed = await confirmPin('Подтвердите действие', confirmText);
        if (!confirmed) return null;
        return await signNFTTransaction(creator, txType, metadata, tokenId, recipient);
    }, [confirmPin, signNFTTransaction]);

    /**
     * Sign a swap transaction
     * Canonical format: sha256(chainId + 'SWAP' + from + tokenIn + tokenOut + amountIn + minAmountOut)
     */
    const signSwapTransaction = useCallback(async (
        from: string,
        tokenIn: 'LVE' | 'USDT',
        amountIn: number,
        minAmountOut: number
    ): Promise<{
        signature: string;
        publicKey: string;
        nonce: number;
        chainId: string;
        signatureScheme: 'ed25519';
    }> => {
        const stored = loadWallets();
        const w = stored.find(w => w.address === from);
        if (!w) throw new Error('Wallet not found');

        // Fetch nonce and chainId from API
        const [nonceRes, networkRes] = await Promise.all([
            networkApi.getNonce(from),
            networkApi.getInfo()
        ]);

        if (!nonceRes.success || !networkRes.success) {
            throw new Error('Failed to fetch nonce or network info');
        }

        const nonce = nonceRes.data!.nextNonce;
        const chainId = networkRes.data!.chainId;
        const tokenOut = tokenIn === 'LVE' ? 'USDT' : 'LVE';

        // Canonical hash format for SWAP
        const canonicalPayload =
            chainId +
            'SWAP' +
            from +
            tokenIn +
            tokenOut +
            amountIn.toString() +
            minAmountOut.toString();
        const txHash = sha256(canonicalPayload);

        // Sign with ed25519
        const privateKeyBytes = hexToBytes(w.privateKey);
        const hashBytes = hexToBytes(txHash);
        const signatureBytes = await ed.signAsync(hashBytes, privateKeyBytes);
        const signature = bytesToHex(signatureBytes);

        return {
            signature,
            publicKey: w.publicKey,
            nonce,
            chainId,
            signatureScheme: 'ed25519'
        };
    }, [loadWallets]);

    /**
     * Sign swap transaction with PIN confirmation
     */
    const signSwapTransactionWithPin = useCallback(async (
        from: string,
        tokenIn: 'LVE' | 'USDT',
        amountIn: number,
        minAmountOut: number,
        confirmText?: string
    ): Promise<{
        signature: string;
        publicKey: string;
        nonce: number;
        chainId: string;
        signatureScheme: 'ed25519';
    } | null> => {
        const tokenOut = tokenIn === 'LVE' ? 'USDT' : 'LVE';
        const description = confirmText || `Swap ${amountIn} ${tokenIn} → ${tokenOut}?`;
        const confirmed = await confirmPin('Подтвердите Swap', description);
        if (!confirmed) return null;
        return await signSwapTransaction(from, tokenIn, amountIn, minAmountOut);
    }, [confirmPin, signSwapTransaction]);

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
        signStakingTransaction,
        signStakingTransactionWithPin,
        signNFTTransaction,
        signNFTTransactionWithPin,
        signSwapTransaction,
        signSwapTransactionWithPin,
        refresh: fetchBalances
    };
}
