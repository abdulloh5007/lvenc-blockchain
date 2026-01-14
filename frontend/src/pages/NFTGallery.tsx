import React, { useState, useEffect } from 'react';
import { Image, Grid, Search, Loader } from 'lucide-react';
import { Card, Button } from '../components';
import { NFTCard } from '../components/NFTCard';
import { nft } from '../api/client';
import type { NFTData } from '../api/client';
import './NFT.css';

export const NFTGallery: React.FC = () => {
    const [nfts, setNfts] = useState<NFTData[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedNFT, setSelectedNFT] = useState<NFTData | null>(null);

    useEffect(() => {
        const fetchNFTs = async () => {
            const res = await nft.getAll();
            if (res.success && res.data) {
                setNfts(res.data);
            }
            setLoading(false);
        };
        fetchNFTs();
        const interval = setInterval(fetchNFTs, 10000);
        return () => clearInterval(interval);
    }, []);

    const formatAddress = (addr: string) => `${addr.slice(0, 8)}...${addr.slice(-6)}`;
    const formatDate = (ts: number) => new Date(ts).toLocaleDateString();

    return (
        <div className="nft-page fade-in">
            <div className="page-header">
                <h1><Image className="header-icon" /> NFT Gallery</h1>
                <p>Исследуйте уникальные цифровые активы</p>
            </div>

            <div className="nft-content">
                <div className="nft-main">
                    <Card title={`Все NFT (${nfts.length})`} icon={<Grid size={20} />}>
                        {loading ? (
                            <div className="loading-state"><Loader className="spin" /> Загрузка...</div>
                        ) : nfts.length === 0 ? (
                            <div className="empty-state">
                                <Image size={48} />
                                <p>NFT пока нет. Создайте первый!</p>
                            </div>
                        ) : (
                            <div className="nft-grid">
                                {nfts.map(n => (
                                    <NFTCard key={n.id} nft={n} onClick={() => setSelectedNFT(n)} />
                                ))}
                            </div>
                        )}
                    </Card>
                </div>

                {selectedNFT && (
                    <div className="nft-detail-sidebar">
                        <Card title="Детали NFT" icon={<Search size={20} />}>
                            <div className="nft-detail">
                                <img src={selectedNFT.metadata.image} alt={selectedNFT.metadata.name} className="detail-image" />
                                <h2>{selectedNFT.metadata.name}</h2>
                                <p className="detail-desc">{selectedNFT.metadata.description || 'Нет описания'}</p>

                                <div className="detail-info">
                                    <div className="info-row">
                                        <span>Token ID</span>
                                        <span className="font-mono">#{selectedNFT.tokenId}</span>
                                    </div>
                                    <div className="info-row">
                                        <span>Создатель</span>
                                        <span className="font-mono">{formatAddress(selectedNFT.creator)}</span>
                                    </div>
                                    <div className="info-row">
                                        <span>Владелец</span>
                                        <span className="font-mono">{formatAddress(selectedNFT.owner)}</span>
                                    </div>
                                    <div className="info-row">
                                        <span>Роялти</span>
                                        <span>{selectedNFT.royalty}%</span>
                                    </div>
                                    <div className="info-row">
                                        <span>Создан</span>
                                        <span>{formatDate(selectedNFT.createdAt)}</span>
                                    </div>
                                </div>

                                {selectedNFT.metadata.attributes.length > 0 && (
                                    <div className="detail-attributes">
                                        <h4>Атрибуты</h4>
                                        <div className="attributes-grid">
                                            {selectedNFT.metadata.attributes.map((attr, i) => (
                                                <div key={i} className="attribute-item">
                                                    <span className="attr-type">{attr.trait_type}</span>
                                                    <span className="attr-value">{attr.value}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <Button variant="ghost" onClick={() => setSelectedNFT(null)} className="close-detail">
                                    Закрыть
                                </Button>
                            </div>
                        </Card>
                    </div>
                )}
            </div>
        </div>
    );
};
