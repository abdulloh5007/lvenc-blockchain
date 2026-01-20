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
    consensusType: 'pos';
    latestBlockHash: string;
    validatorReward: number;
    initialReward: number;
    minReward: number;
    blocksUntilNextReduction: number;
    reductionInterval: number;
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
    getBlocks: (offset = 0, limit = 20) => fetchApi<{
        blocks: Block[];
        total: number;
        offset: number;
        limit: number;
        hasMore: boolean;
    }>(`/blockchain/blocks?offset=${offset}&limit=${limit}`),
    getLatest: () => fetchApi<Block>('/blockchain/latest'),
    getBlock: (hash: string) => fetchApi<Block>(`/blockchain/block/${hash}`),
    validate: () => fetchApi<{ valid: boolean; blocks: number }>('/blockchain/validate'),
    getFee: () => fetchApi<FeeInfo>('/blockchain/fee'),
};
export interface NetworkInfo {
    network: 'testnet' | 'mainnet';
    isTestnet: boolean;
    symbol: string;
    addressPrefix: string;
    faucetEnabled: boolean;
    chainId: string;  // Required for canonical tx hash
}
export const networkApi = {
    getInfo: () => fetchApi<NetworkInfo>('/network-info'),
    // Get next nonce for an address (required for replay protection)
    getNonce: (address: string) => fetchApi<{
        address: string;
        lastNonce: number;
        nextNonce: number;
        pendingCount: number;
    }>(`/nonce/${address}`),
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
    getBalance: (address: string) => fetchApi<{ address: string; balance: number; symbol: string }>(`/wallet/${address}/balance`),
    getTransactions: (address: string) => fetchApi<{ address: string; transactions: Transaction[]; count: number }>(`/wallet/${address}/transactions`),
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
    send: (from: string, to: string, amount: number, fee: number, signature: string, publicKey: string, timestamp: number) =>
        fetchApi<{ transactionId: string; from: string; to: string; amount: number; fee: number; status: string }>('/transaction/send', {
            method: 'POST',
            body: JSON.stringify({ from, to, amount, fee, signature, publicKey, timestamp }),
        }),
    get: (id: string) => fetchApi<{ transaction: Transaction; blockIndex: number | null; confirmed: boolean }>(`/transaction/${id}`),
    getPending: () => fetchApi<{ transactions: Transaction[]; count: number }>('/transaction/pool/pending'),
};



// Staking (PoS)
export interface ValidatorInfo {
    address: string;
    stake: number;
    delegatedStake: number;
    commission: number;
    blocksCreated: number;
    totalRewards: number;
    slashCount: number;
    isActive: boolean;
}

export interface StakeInfo {
    address: string;
    stake: number;
    unstakeRequests: { amount: number; availableAt: number }[];
    isValidator: boolean;
}

// Epoch Info
export interface EpochInfo {
    currentEpoch: number;
    epochDuration: number;
    startBlock: number;
    endBlock: number;
    currentBlock: number;
    blocksRemaining: number;
    progress: number;
}

// Delegation
export interface Delegation {
    delegator: string;
    validator: string;
    amount: number;
    delegatedAt: number;
    epochDelegated: number;
}

export const staking = {
    // Epoch
    getEpoch: () => fetchApi<EpochInfo>('/staking/epoch'),

    // Staking
    // Client signs tx locally with ed25519, API only relays to mempool
    // Canonical format: sha256(chainId + txType + from + to + amount + fee + nonce)
    stake: (address: string, amount: number, signature: string, publicKey: string, nonce: number, chainId: string, signatureScheme: 'ed25519' = 'ed25519') => fetchApi<{
        message: string;
        txId: string;
        status: string;
        amount: number;
        effectiveEpoch: number;
    }>('/staking/stake', {
        method: 'POST',
        body: JSON.stringify({ address, amount, signature, publicKey, nonce, chainId, signatureScheme }),
    }),
    unstake: (address: string, amount: number) => fetchApi<{
        message: string;
        effectiveEpoch: number;
        remainingStake: number
    }>('/staking/unstake', {
        method: 'POST',
        body: JSON.stringify({ address, amount }),
    }),
    claim: (address: string) => fetchApi<{ message: string; amount: number }>('/staking/claim', {
        method: 'POST',
        body: JSON.stringify({ address }),
    }),

    // Delegation - Client signs tx locally with ed25519, API only relays
    // Canonical format: sha256(chainId + txType + from + to + amount + fee + nonce)
    delegate: (delegator: string, validator: string, amount: number, signature: string, publicKey: string, nonce: number, chainId: string, signatureScheme: 'ed25519' = 'ed25519') => fetchApi<{
        message: string;
        effectiveEpoch: number;
        delegations: Delegation[];
    }>('/staking/delegate', {
        method: 'POST',
        body: JSON.stringify({ delegator, validator, amount, signature, publicKey, nonce, chainId, signatureScheme }),
    }),
    undelegate: (delegator: string, validator: string, amount: number) => fetchApi<{
        message: string;
        transactionId: string;
        remainingDelegations: Delegation[];
    }>('/staking/undelegate', {
        method: 'POST',
        body: JSON.stringify({ delegator, validator, amount }),
    }),
    getDelegations: (address: string) => fetchApi<{
        address: string;
        delegations: Delegation[];
        totalDelegated: number;
    }>(`/staking/delegations/${address}`),

    // Validators
    getValidators: () => fetchApi<{
        validators: (ValidatorInfo & { totalWeight: number })[];
        totalStaked: number;
        totalDelegated: number;
        count: number
    }>('/staking/validators'),
    getValidator: (address: string) => fetchApi<{
        validator: ValidatorInfo & { totalWeight: number };
        delegators: { delegator: string; amount: number }[];
    }>(`/staking/validator/${address}`),
    setCommission: (address: string, commission: number) => fetchApi<{ message: string }>('/staking/commission', {
        method: 'POST',
        body: JSON.stringify({ address, commission }),
    }),

    // User staking info
    getStake: (address: string) => fetchApi<{
        address: string;
        stake: number;
        pendingStake: number;
        unstakeRequests: any[];
        delegations: Delegation[];
        totalDelegated: number;
        isValidator: boolean;
        currentEpoch: number;
    }>(`/staking/${address}`),
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
