import { sha256 } from '../utils/crypto.js';

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

export class NFTCollection {
    public id: string;
    public name: string;
    public symbol: string;
    public creator: string;
    public description: string;
    public image: string;
    public maxSupply: number;
    public mintedCount: number;
    public createdAt: number;

    constructor(
        name: string,
        symbol: string,
        creator: string,
        description: string = '',
        image: string = '',
        maxSupply: number = 10000
    ) {
        this.name = name;
        this.symbol = symbol.toUpperCase().slice(0, 10);
        this.creator = creator;
        this.description = description;
        this.image = image;
        this.maxSupply = maxSupply;
        this.mintedCount = 0;
        this.createdAt = Date.now();
        this.id = this.calculateId();
    }

    calculateId(): string {
        return sha256(`${this.name}${this.symbol}${this.creator}${this.createdAt}`);
    }

    canMint(): boolean {
        return this.mintedCount < this.maxSupply;
    }

    incrementMinted(): void {
        this.mintedCount++;
    }

    toJSON(): NFTCollectionData {
        return {
            id: this.id,
            name: this.name,
            symbol: this.symbol,
            creator: this.creator,
            description: this.description,
            image: this.image,
            maxSupply: this.maxSupply,
            mintedCount: this.mintedCount,
            createdAt: this.createdAt,
        };
    }

    static fromJSON(data: NFTCollectionData): NFTCollection {
        const collection = new NFTCollection(
            data.name,
            data.symbol,
            data.creator,
            data.description,
            data.image,
            data.maxSupply
        );
        collection.id = data.id;
        collection.mintedCount = data.mintedCount;
        collection.createdAt = data.createdAt;
        return collection;
    }
}
