import { sha256 } from '../utils/crypto.js';

export interface NFTAttribute {
    trait_type: string;
    value: string;
}

export interface NFTMetadata {
    name: string;
    description: string;
    image: string;  // Base64 или URL
    attributes: NFTAttribute[];
}

export interface TransferRecord {
    from: string;
    to: string;
    timestamp: number;
    transactionId: string;
}

export interface NFTData {
    id: string;
    tokenId: number;
    collectionId: string | null;
    creator: string;
    owner: string;
    metadata: NFTMetadata;
    royalty: number;  // 0-10%
    createdAt: number;
    transferHistory: TransferRecord[];
}

export class NFT {
    public id: string;
    public tokenId: number;
    public collectionId: string | null;
    public creator: string;
    public owner: string;
    public metadata: NFTMetadata;
    public royalty: number;
    public createdAt: number;
    public transferHistory: TransferRecord[];

    constructor(
        tokenId: number,
        creator: string,
        metadata: NFTMetadata,
        collectionId: string | null = null,
        royalty: number = 5
    ) {
        this.tokenId = tokenId;
        this.collectionId = collectionId;
        this.creator = creator;
        this.owner = creator;
        this.metadata = metadata;
        this.royalty = Math.min(Math.max(royalty, 0), 10);
        this.createdAt = Date.now();
        this.transferHistory = [];
        this.id = this.calculateId();
    }

    calculateId(): string {
        const data = `${this.tokenId}${this.creator}${this.metadata.name}${this.createdAt}`;
        return sha256(data);
    }

    transfer(to: string, transactionId: string): void {
        this.transferHistory.push({
            from: this.owner,
            to,
            timestamp: Date.now(),
            transactionId,
        });
        this.owner = to;
    }

    toJSON(): NFTData {
        return {
            id: this.id,
            tokenId: this.tokenId,
            collectionId: this.collectionId,
            creator: this.creator,
            owner: this.owner,
            metadata: this.metadata,
            royalty: this.royalty,
            createdAt: this.createdAt,
            transferHistory: this.transferHistory,
        };
    }

    static fromJSON(data: NFTData): NFT {
        const nft = new NFT(
            data.tokenId,
            data.creator,
            data.metadata,
            data.collectionId,
            data.royalty
        );
        nft.id = data.id;
        nft.owner = data.owner;
        nft.createdAt = data.createdAt;
        nft.transferHistory = data.transferHistory;
        return nft;
    }
}
