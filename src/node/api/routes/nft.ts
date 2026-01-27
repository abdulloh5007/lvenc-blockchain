import { Router, Request, Response } from 'express';
import { NFTManager, NFTMetadata } from '../../../runtime/nft/index.js';
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

    // Mint NFT (signature-based - no privateKey received)
    router.post('/mint', async (req: Request, res: Response) => {
        const { creator, metadata, signature, publicKey, nonce, chainId, signatureScheme, collectionId, royalty } = req.body;

        if (!creator || !metadata?.name || !metadata?.image) {
            res.status(400).json({ success: false, error: 'Creator and metadata (name, image) are required' });
            return;
        }

        if (!signature || !publicKey) {
            res.status(400).json({ success: false, error: 'Signature and publicKey are required' });
            return;
        }

        // Verify ed25519 signature
        try {
            const ed = await import('@noble/ed25519');
            const { sha256 } = await import('@noble/hashes/sha256');
            const { bytesToHex } = await import('@noble/hashes/utils');

            // Recreate canonical payload that was signed
            const canonicalPayload =
                (chainId || 'lvenc-testnet') +
                'NFT_MINT' +
                creator +
                'NEW' +
                metadata.name +
                '';
            const txHash = bytesToHex(sha256(canonicalPayload));

            // Verify signature
            const signatureBytes = Buffer.from(signature, 'hex');
            const publicKeyBytes = Buffer.from(publicKey, 'hex');
            const hashBytes = Buffer.from(txHash, 'hex');

            const isValid = await ed.verifyAsync(signatureBytes, hashBytes, publicKeyBytes);
            if (!isValid) {
                res.status(403).json({ success: false, error: 'Invalid signature' });
                return;
            }

            // Verify publicKey matches creator address
            const { chainParams } = await import('../../../protocol/params/chain.js');
            const addressHash = bytesToHex(sha256(publicKey)).substring(0, 40);
            const expectedAddress = chainParams.addressPrefix + addressHash;
            if (expectedAddress !== creator) {
                res.status(403).json({ success: false, error: 'Public key does not match creator address' });
                return;
            }
        } catch (err) {
            res.status(400).json({ success: false, error: 'Signature verification failed' });
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

    // Transfer NFT (signature-based - no privateKey received)
    router.post('/transfer', async (req: Request, res: Response) => {
        const { nftId, to, signature, publicKey, nonce, chainId, signatureScheme } = req.body;

        if (!nftId || !to || !signature || !publicKey) {
            res.status(400).json({ success: false, error: 'nftId, to, signature, and publicKey are required' });
            return;
        }

        const nftItem = nftManager.getNFT(nftId);
        if (!nftItem) {
            res.status(404).json({ success: false, error: 'NFT not found' });
            return;
        }

        // Verify ed25519 signature
        try {
            const ed = await import('@noble/ed25519');
            const { sha256 } = await import('@noble/hashes/sha256');
            const { bytesToHex } = await import('@noble/hashes/utils');

            // Recreate canonical payload that was signed
            const canonicalPayload =
                (chainId || 'lvenc-testnet') +
                'NFT_TRANSFER' +
                nftItem.owner +
                nftId +
                nftItem.metadata.name +
                to;
            const txHash = bytesToHex(sha256(canonicalPayload));

            // Verify signature
            const signatureBytes = Buffer.from(signature, 'hex');
            const publicKeyBytes = Buffer.from(publicKey, 'hex');
            const hashBytes = Buffer.from(txHash, 'hex');

            const isValid = await ed.verifyAsync(signatureBytes, hashBytes, publicKeyBytes);
            if (!isValid) {
                res.status(403).json({ success: false, error: 'Invalid signature' });
                return;
            }

            // Verify publicKey matches current owner address
            const { chainParams } = await import('../../../protocol/params/chain.js');
            const addressHash = bytesToHex(sha256(publicKey)).substring(0, 40);
            const expectedAddress = chainParams.addressPrefix + addressHash;
            if (expectedAddress !== nftItem.owner) {
                res.status(403).json({ success: false, error: 'You do not own this NFT' });
                return;
            }
        } catch (err) {
            res.status(400).json({ success: false, error: 'Signature verification failed' });
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
                from: nftItem.owner,
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
