// Use environment variable, fallback to localhost for development
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
}

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options?.headers,
            },
        });
        return await response.json();
    } catch (error) {
        return { success: false, error: 'Network error' };
    }
}

// Blockchain
export interface BlockchainStats {
    blocks: number;
    transactions: number;
    pendingTransactions: number;
    difficulty: number;
    latestBlockHash: string;
    miningReward: number;
    initialReward: number;
    nextHalvingBlock: number;
    blocksUntilHalving: number;
    halvingsDone: number;
    coinSymbol: string;
    totalSupply: number;
}

export interface Block {
    index: number;
    timestamp: number;
    transactions: Transaction[];
    previousHash: string;
    hash: string;
    nonce: number;
    difficulty: number;
    miner?: string;
}

export const blockchain = {
    getStats: () => fetchApi<BlockchainStats>('/blockchain'),
    getChain: () => fetchApi<{ length: number; chain: Block[] }>('/blockchain/chain'),
    getLatest: () => fetchApi<Block>('/blockchain/latest'),
    getBlock: (hash: string) => fetchApi<Block>(`/blockchain/block/${hash}`),
    validate: () => fetchApi<{ valid: boolean; blocks: number }>('/blockchain/validate'),
    getFee: () => fetchApi<FeeInfo>('/blockchain/fee'),
};

// Dynamic Fee Info
export interface FeeInfo {
    low: number;
    medium: number;
    high: number;
    recommended: number;
    congestion: 'low' | 'medium' | 'high' | 'critical';
    pendingTransactions: number;
    maxPerBlock: number;
}

// Wallet
export interface WalletInfo {
    address: string;
    publicKey?: string;
    privateKey?: string;
    mnemonic?: string;
    label?: string;
    balance?: number;
    createdAt?: number;
    warning?: string;
}

export const wallet = {
    create: (label?: string) => fetchApi<WalletInfo>('/wallet/new', {
        method: 'POST',
        body: JSON.stringify({ label }),
    }),
    getBalance: (address: string) => fetchApi<{ address: string; balance: number; symbol: string }>(`/wallet/${address}/balance`),
    getTransactions: (address: string) => fetchApi<{ address: string; transactions: Transaction[]; count: number }>(`/wallet/${address}/transactions`),
    list: () => fetchApi<WalletInfo[]>('/wallet'),
    import: (mnemonic: string, label?: string) => fetchApi<WalletInfo>('/wallet/import', {
        method: 'POST',
        body: JSON.stringify({ mnemonic, label }),
    }),
    validateMnemonic: (mnemonic: string) => fetchApi<{ valid: boolean }>('/wallet/validate-mnemonic', {
        method: 'POST',
        body: JSON.stringify({ mnemonic }),
    }),
};

// Transactions
export interface Transaction {
    id: string;
    fromAddress: string | null;
    toAddress: string;
    amount: number;
    fee: number;
    timestamp: number;
    signature?: string;
}

export const transaction = {
    send: (fromAddress: string, toAddress: string, amount: number, privateKey: string, fee: number = 0.1) =>
        fetchApi<{ transactionId: string; from: string; to: string; amount: number; fee: number; status: string }>('/transaction/send', {
            method: 'POST',
            body: JSON.stringify({ fromAddress, toAddress, amount, privateKey, fee }),
        }),
    get: (id: string) => fetchApi<{ transaction: Transaction; blockIndex: number | null; confirmed: boolean }>(`/transaction/${id}`),
    getPending: () => fetchApi<{ transactions: Transaction[]; count: number }>('/transaction/pool/pending'),
};

// Mining
export interface MiningInfo {
    difficulty: number;
    reward: number;
    pendingTransactions: number;
    lastBlockHash: string;
}

export interface MineResult {
    message: string;
    block: {
        index: number;
        hash: string;
        transactions: number;
        nonce: number;
        reward: number;
    };
}

export const mining = {
    mine: (minerAddress: string) => fetchApi<MineResult>('/mining/mine', {
        method: 'POST',
        body: JSON.stringify({ minerAddress }),
    }),
    getInfo: () => fetchApi<MiningInfo>('/mining/info'),
};

// Network
export const network = {
    getPeers: () => fetchApi<{ peers: string[]; count: number }>('/network/peers'),
    connect: (peerUrl: string) => fetchApi<{ message: string; totalPeers: number }>('/network/peers/connect', {
        method: 'POST',
        body: JSON.stringify({ peerUrl }),
    }),
};

// Faucet
export const faucet = {
    request: (address: string) => fetchApi<{ message: string; transactionId: string }>('/faucet', {
        method: 'POST',
        body: JSON.stringify({ address }),
    }),
};

// NFT Types
export interface NFTAttribute {
    trait_type: string;
    value: string;
}

export interface NFTMetadata {
    name: string;
    description: string;
    image: string;
    attributes: NFTAttribute[];
}

export interface NFTData {
    id: string;
    tokenId: number;
    collectionId: string | null;
    creator: string;
    owner: string;
    metadata: NFTMetadata;
    royalty: number;
    createdAt: number;
    transferHistory: { from: string; to: string; timestamp: number; transactionId: string }[];
}

export interface NFTCollectionData {
    id: string;
    name: string;
    symbol: string;
    creator: string;
    description: string;
    image: string;
    maxSupply: number;
    mintedCount: number;
    createdAt: number;
}

// NFT API
export const nft = {
    getAll: () => fetchApi<NFTData[]>('/nft'),
    get: (id: string) => fetchApi<NFTData>(`/nft/${id}`),
    getByOwner: (address: string) => fetchApi<NFTData[]>(`/nft/owner/${address}`),
    getHistory: (id: string) => fetchApi<{ from: string; to: string; timestamp: number; transactionId: string }[]>(`/nft/${id}/history`),
    mint: (creator: string, metadata: NFTMetadata, privateKey: string, collectionId?: string, royalty?: number) =>
        fetchApi<NFTData>('/nft/mint', {
            method: 'POST',
            body: JSON.stringify({ creator, metadata, privateKey, collectionId, royalty }),
        }),
    transfer: (nftId: string, to: string, privateKey: string) =>
        fetchApi<{ nftId: string; from: string; to: string; transactionId: string }>('/nft/transfer', {
            method: 'POST',
            body: JSON.stringify({ nftId, to, privateKey }),
        }),
    // Collections
    getCollections: () => fetchApi<NFTCollectionData[]>('/nft/collections'),
    getCollection: (id: string) => fetchApi<NFTCollectionData>(`/nft/collections/${id}`),
    createCollection: (name: string, symbol: string, creator: string, description?: string, image?: string, maxSupply?: number) =>
        fetchApi<NFTCollectionData>('/nft/collections', {
            method: 'POST',
            body: JSON.stringify({ name, symbol, creator, description, image, maxSupply }),
        }),
    getNFTsByCollection: (collectionId: string) => fetchApi<NFTData[]>(`/nft/collection/${collectionId}/nfts`),
};

// IPFS Types
export interface IPFSStatus {
    connected: boolean;
    peerId?: string;
    agentVersion?: string;
    gatewayUrl?: string;
    message?: string;
}

export interface IPFSUploadResult {
    cid: string;
    ipfsUrl: string;
    gatewayUrl: string;
    size: number;
}

// IPFS API
export const ipfs = {
    status: () => fetchApi<IPFSStatus>('/ipfs/status'),
    upload: (data: string, filename?: string) =>
        fetchApi<IPFSUploadResult>('/ipfs/upload', {
            method: 'POST',
            body: JSON.stringify({ data, filename }),
        }),
    getFileUrl: (cid: string) => `${API_BASE}/ipfs/file/${cid}`,
    pin: (cid: string) =>
        fetchApi<{ cid: string; pinned: boolean }>(`/ipfs/pin/${cid}`, {
            method: 'POST',
        }),
    listPins: () => fetchApi<{ pins: string[]; count: number }>('/ipfs/pins'),
};

export const api = {
    nft,
    ipfs,
};
