import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader } from 'lucide-react';
import { api } from '../api/client';
import type { NFTCollectionData, NFTData } from '../api/client';
import { Button } from '../components/Button';
import { NFTCard } from '../components/NFTCard';
import { useI18n } from '../contexts/I18nContext';
import './NFTCollectionDetail.css';

export const NFTCollectionDetail: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { t } = useI18n();
    const [collection, setCollection] = useState<NFTCollectionData | null>(null);
    const [nfts, setNfts] = useState<NFTData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            if (!id) return;
            try {
                setLoading(true);
                const colRes = await api.nft.getCollection(id);
                if (!colRes.success || !colRes.data) {
                    throw new Error(colRes.error || 'Collection not found');
                }
                setCollection(colRes.data);

                const nftRes = await api.nft.getNFTsByCollection(id);
                if (nftRes.success && nftRes.data) {
                    setNfts(nftRes.data);
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load collection');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [id]);

    const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

    if (loading) {
        return (
            <div className="collection-detail-page">
                <div className="collection-loading">
                    <Loader className="spin" size={40} />
                    <p>{t('common.loading')}</p>
                </div>
            </div>
        );
    }

    if (error || !collection) {
        return (
            <div className="collection-detail-page">
                <div className="collection-error">
                    <h2>{t('common.error')}</h2>
                    <p>{error || 'Collection not found'}</p>
                    <Button variant="secondary" onClick={() => navigate('/nft/collections')}>
                        {t('collections.detail.backTo')}
                    </Button>
                </div>
            </div>
        );
    }

    const mintPercentage = Math.round((collection.mintedCount / collection.maxSupply) * 100);

    return (
        <div className="collection-detail-page fade-in">
            <button className="back-link" onClick={() => navigate('/nft/collections')}>
                <ArrowLeft size={18} />
                {t('collections.detail.backTo')}
            </button>

            <div className="collection-hero">
                {collection.image ? (
                    <img
                        src={collection.image.replace('ipfs://', 'https://gateway.lighthouse.storage/ipfs/')}
                        alt={collection.name}
                        className="hero-image"
                    />
                ) : (
                    <div className="hero-placeholder">
                        {collection.symbol[0]}
                    </div>
                )}

                <div className="hero-content">
                    <div className="hero-header">
                        <div>
                            <h1>{collection.name}</h1>
                            <span className="symbol-badge">{collection.symbol}</span>
                        </div>
                        <Button
                            variant="primary"
                            onClick={() => navigate('/nft/mint', { state: { collectionId: collection.id } })}
                            disabled={collection.mintedCount >= collection.maxSupply}
                        >
                            {t('collections.detail.mintNft')}
                        </Button>
                    </div>

                    <p className="hero-description">
                        {collection.description || 'No description provided.'}
                    </p>

                    <div className="hero-meta">
                        <div className="meta-item">
                            <span className="meta-label">{t('collections.detail.createdBy')}</span>
                            <span className="meta-value">{formatAddress(collection.creator)}</span>
                        </div>
                        <div className="meta-item">
                            <span className="meta-label">{t('collections.detail.date')}</span>
                            <span className="meta-value">{new Date(collection.createdAt).toLocaleDateString()}</span>
                        </div>
                    </div>

                    <div className="stats-row">
                        <div className="stat-card">
                            <span className="stat-label">{t('collections.items')}</span>
                            <span className="stat-value">{collection.mintedCount}</span>
                        </div>
                        <div className="stat-card">
                            <span className="stat-label">{t('collections.maxSupply')}</span>
                            <span className="stat-value">{collection.maxSupply}</span>
                        </div>
                        <div className="stat-card">
                            <span className="stat-label">{t('collections.minted')}</span>
                            <span className="stat-value">{mintPercentage}%</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="collection-nfts-section">
                <h2>{t('collections.detail.itemsIn')}</h2>
                {nfts.length > 0 ? (
                    <div className="nfts-grid">
                        {nfts.map(nft => (
                            <NFTCard
                                key={nft.id}
                                nft={nft}
                                onClick={() => navigate(`/nft/${nft.id}`)}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="nfts-empty">
                        <p>{t('collections.detail.noItems')}</p>
                        <Button
                            variant="secondary"
                            onClick={() => navigate('/nft/mint', { state: { collectionId: collection.id } })}
                        >
                            {t('collections.detail.beFirst')}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
};
