import { Router, Request, Response } from 'express';
import { NFTManager, NFTMetadata } from '../../../runtime/nft/index.js';
import { Wallet } from '../../../protocol/wallet/index.js';
import { storage } from '../../../protocol/storage/index.js';

export function createNFTRoutes(nftManager: NFTManager): Router {
    const router = Router();

    // Get all collections
    router.get('/collections', (_req: Request, res: Response) => {
        const collections = nftManager.getAllCollections();
        res.json({
            success: true,
            data: collections.map(c => c.toJSON()),
        });
    });

    // Create collection
    router.post('/collections', (req: Request, res: Response) => {
        const { name, symbol, creator, description, image, maxSupply } = req.body;

        if (!name || !symbol || !creator) {
            res.status(400).json({ success: false, error: 'Name, symbol, and creator are required' });
            return;
        }

        const collection = nftManager.createCollection(name, symbol, creator, description, image, maxSupply);
        res.json({ success: true, data: collection.toJSON() });
    });

    // Get collection by ID
    router.get('/collections/:id', (req: Request, res: Response) => {
        const collection = nftManager.getCollection(req.params.id);
        if (!collection) {
            res.status(404).json({ success: false, error: 'Collection not found' });
            return;
        }
        res.json({ success: true, data: collection.toJSON() });
    });

    // Get all NFTs
    router.get('/', (_req: Request, res: Response) => {
        const nfts = nftManager.getAllNFTs();
        res.json({
            success: true,
            data: nfts.map(n => n.toJSON()),
        });
    });

    // Mint NFT
    router.post('/mint', async (req: Request, res: Response) => {
        const { creator, metadata, collectionId, royalty, privateKey } = req.body;

        if (!creator || !metadata?.name || !metadata?.image) {
            res.status(400).json({ success: false, error: 'Creator and metadata (name, image) are required' });
            return;
        }

        // Verify ownership
        try {
            const wallet = await Wallet.fromPrivateKey(privateKey);
            if (wallet.address !== creator) {
                res.status(403).json({ success: false, error: 'Private key does not match creator address' });
                return;
            }
        } catch {
            res.status(400).json({ success: false, error: 'Invalid private key' });
            return;
        }

        const nftMetadata: NFTMetadata = {
            name: metadata.name,
            description: metadata.description || '',
            image: metadata.image,
            attributes: metadata.attributes || [],
        };

        const nft = nftManager.mint(creator, nftMetadata, collectionId || null, royalty || 5);
        if (!nft) {
            res.status(400).json({ success: false, error: 'Failed to mint NFT' });
            return;
        }

        res.json({ success: true, data: nft.toJSON() });
    });

    // Get NFT by ID
    router.get('/:id', (req: Request, res: Response) => {
        const nft = nftManager.getNFT(req.params.id);
        if (!nft) {
            res.status(404).json({ success: false, error: 'NFT not found' });
            return;
        }
        res.json({ success: true, data: nft.toJSON() });
    });

    // Get NFTs by owner
    router.get('/owner/:address', (req: Request, res: Response) => {
        const nfts = nftManager.getNFTsByOwner(req.params.address);
        res.json({
            success: true,
            data: nfts.map(n => n.toJSON()),
        });
    });

    // Get NFTs by collection
    router.get('/collection/:collectionId/nfts', (req: Request, res: Response) => {
        const nfts = nftManager.getNFTsByCollection(req.params.collectionId);
        res.json({
            success: true,
            data: nfts.map(n => n.toJSON()),
        });
    });

    // Transfer NFT
    router.post('/transfer', async (req: Request, res: Response) => {
        const { nftId, to, privateKey } = req.body;

        if (!nftId || !to || !privateKey) {
            res.status(400).json({ success: false, error: 'nftId, to, and privateKey are required' });
            return;
        }

        const nft = nftManager.getNFT(nftId);
        if (!nft) {
            res.status(404).json({ success: false, error: 'NFT not found' });
            return;
        }

        // Verify ownership
        try {
            const wallet = await Wallet.fromPrivateKey(privateKey);
            if (wallet.address !== nft.owner) {
                res.status(403).json({ success: false, error: 'You do not own this NFT' });
                return;
            }
        } catch {
            res.status(400).json({ success: false, error: 'Invalid private key' });
            return;
        }

        const transactionId = `nft-transfer-${Date.now()}`;
        const success = nftManager.transfer(nftId, to, transactionId);

        if (!success) {
            res.status(400).json({ success: false, error: 'Transfer failed' });
            return;
        }

        res.json({
            success: true,
            data: {
                nftId,
                from: nft.creator,
                to,
                transactionId,
            },
        });
    });

    // Get transfer history
    router.get('/:id/history', (req: Request, res: Response) => {
        const nft = nftManager.getNFT(req.params.id);
        if (!nft) {
            res.status(404).json({ success: false, error: 'NFT not found' });
            return;
        }
        res.json({
            success: true,
            data: nft.transferHistory,
        });
    });

    return router;
}
