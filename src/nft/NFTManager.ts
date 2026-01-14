import { NFT, NFTData, NFTMetadata } from './NFT.js';
import { NFTCollection, NFTCollectionData } from './NFTCollection.js';
import { logger } from '../utils/logger.js';

export class NFTManager {
    private nfts: Map<string, NFT> = new Map();
    private collections: Map<string, NFTCollection> = new Map();
    private tokenCounter: number = 0;

    constructor() { }

    // Collections
    createCollection(
        name: string,
        symbol: string,
        creator: string,
        description: string = '',
        image: string = '',
        maxSupply: number = 10000
    ): NFTCollection {
        const collection = new NFTCollection(name, symbol, creator, description, image, maxSupply);
        this.collections.set(collection.id, collection);
        logger.info(`🎨 Collection created: ${name} (${symbol})`);
        return collection;
    }

    getCollection(id: string): NFTCollection | undefined {
        return this.collections.get(id);
    }

    getAllCollections(): NFTCollection[] {
        return Array.from(this.collections.values());
    }

    // NFTs
    mint(
        creator: string,
        metadata: NFTMetadata,
        collectionId: string | null = null,
        royalty: number = 5
    ): NFT | null {
        if (collectionId) {
            const collection = this.collections.get(collectionId);
            if (!collection) {
                logger.warn(`Collection not found: ${collectionId}`);
                return null;
            }
            if (!collection.canMint()) {
                logger.warn(`Collection ${collection.name} reached max supply`);
                return null;
            }
            collection.incrementMinted();
        }

        this.tokenCounter++;
        const nft = new NFT(this.tokenCounter, creator, metadata, collectionId, royalty);
        this.nfts.set(nft.id, nft);
        logger.info(`🖼️ NFT minted: #${nft.tokenId} "${metadata.name}" by ${creator.slice(0, 10)}...`);
        return nft;
    }

    getNFT(id: string): NFT | undefined {
        return this.nfts.get(id);
    }

    getAllNFTs(): NFT[] {
        return Array.from(this.nfts.values());
    }

    getNFTsByOwner(owner: string): NFT[] {
        return this.getAllNFTs().filter(nft => nft.owner === owner);
    }

    getNFTsByCollection(collectionId: string): NFT[] {
        return this.getAllNFTs().filter(nft => nft.collectionId === collectionId);
    }

    getNFTsByCreator(creator: string): NFT[] {
        return this.getAllNFTs().filter(nft => nft.creator === creator);
    }

    transfer(nftId: string, to: string, transactionId: string): boolean {
        const nft = this.nfts.get(nftId);
        if (!nft) {
            logger.warn(`NFT not found: ${nftId}`);
            return false;
        }
        const from = nft.owner;
        nft.transfer(to, transactionId);
        logger.info(`🔄 NFT #${nft.tokenId} transferred: ${from.slice(0, 8)}... → ${to.slice(0, 8)}...`);
        return true;
    }

    // Serialization
    exportData(): { nfts: NFTData[]; collections: NFTCollectionData[]; tokenCounter: number } {
        return {
            nfts: this.getAllNFTs().map(nft => nft.toJSON()),
            collections: this.getAllCollections().map(c => c.toJSON()),
            tokenCounter: this.tokenCounter,
        };
    }

    importData(data: { nfts: NFTData[]; collections: NFTCollectionData[]; tokenCounter: number }): void {
        this.nfts.clear();
        this.collections.clear();

        data.collections.forEach(c => {
            this.collections.set(c.id, NFTCollection.fromJSON(c));
        });

        data.nfts.forEach(n => {
            this.nfts.set(n.id, NFT.fromJSON(n));
        });

        this.tokenCounter = data.tokenCounter || 0;
        logger.info(`📦 Loaded ${data.nfts.length} NFTs and ${data.collections.length} collections`);
    }
}
