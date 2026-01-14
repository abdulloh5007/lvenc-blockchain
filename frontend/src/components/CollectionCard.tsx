import React from 'react';
import type { NFTCollectionData } from '../api/client';
import './CollectionCard.css';

interface CollectionCardProps {
    collection: NFTCollectionData;
    onClick?: (id: string) => void;
}

export const CollectionCard: React.FC<CollectionCardProps> = ({ collection, onClick }) => {
    const handleClick = () => {
        if (onClick) {
            onClick(collection.id);
        }
    };

    // Calculate progress percentage
    const mintedPercentage = Math.round((collection.mintedCount / collection.maxSupply) * 100);

    return (
        <div className="collection-card" onClick={handleClick}>
            <div className="collection-image-container">
                {collection.image ? (
                    <img
                        src={collection.image.replace('ipfs://', 'https://gateway.lighthouse.storage/ipfs/')}
                        alt={collection.name}
                        className="collection-image"
                        loading="lazy"
                    />
                ) : (
                    <div className="collection-image-placeholder">
                        <span>{collection.symbol[0]}</span>
                    </div>
                )}
            </div>

            <div className="collection-content">
                <div className="collection-header">
                    <h3 className="collection-title">{collection.name}</h3>
                    <span className="collection-symbol">{collection.symbol}</span>
                </div>

                <p className="collection-description">
                    {collection.description || 'No description provided.'}
                </p>

                <div className="collection-stats">
                    <div className="stat-item">
                        <span className="stat-label">Supply</span>
                        <span className="stat-value">{collection.mintedCount} / {collection.maxSupply}</span>
                    </div>
                    <div className="stat-item">
                        <span className="stat-label">Minted</span>
                        <span className="stat-value">{mintedPercentage}%</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
