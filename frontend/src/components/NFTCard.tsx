import React from 'react';
import { User } from 'lucide-react';
import type { NFTData } from '../api/client';
import './NFTCard.css';

interface NFTCardProps {
    nft: NFTData;
    onClick?: () => void;
}

const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

export const NFTCard: React.FC<NFTCardProps> = ({ nft, onClick }) => {
    return (
        <div className="nft-card" onClick={onClick}>
            <div className="nft-image-container">
                <img
                    src={nft.metadata.image}
                    alt={nft.metadata.name}
                    className="nft-image"
                    onError={(e) => {
                        (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23374151" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="%239CA3AF" font-size="12">No Image</text></svg>';
                    }}
                />
                <span className="nft-token-id">#{nft.tokenId}</span>
            </div>
            <div className="nft-info">
                <h3 className="nft-name">{nft.metadata.name}</h3>
                {nft.metadata.description && (
                    <p className="nft-description">{nft.metadata.description.slice(0, 60)}...</p>
                )}
                <div className="nft-owner">
                    <User size={12} />
                    <span className="font-mono">{formatAddress(nft.owner)}</span>
                </div>
                {nft.metadata.attributes.length > 0 && (
                    <div className="nft-attributes">
                        {nft.metadata.attributes.slice(0, 2).map((attr, i) => (
                            <span key={i} className="nft-attribute">
                                {attr.trait_type}: {attr.value}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
