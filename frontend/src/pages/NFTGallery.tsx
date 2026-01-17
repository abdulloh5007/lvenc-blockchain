import React, { useState, useEffect } from 'react';
import { Image, Loader, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { NFTCard } from '../components/NFTCard';
import { nft } from '../api/client';
import type { NFTData } from '../api/client';
import './NFT.css';

const ITEMS_PER_PAGE = 12;

export const NFTGallery: React.FC = () => {
    const [nfts, setNfts] = useState<NFTData[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedNFT, setSelectedNFT] = useState<NFTData | null>(null);
    const [currentPage, setCurrentPage] = useState(1);

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

    // Pagination logic
    const totalPages = Math.ceil(nfts.length / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const paginatedNFTs = nfts.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    const goToPage = (page: number) => {
        if (page >= 1 && page <= totalPages) {
            setCurrentPage(page);
        }
    };

    return (
        <div className="nft-gallery-page fade-in">
            <div className="gallery-header">
                <h1>NFT Gallery</h1>
                <span className="nft-count">{nfts.length} NFT</span>
            </div>

            {loading ? (
                <div className="gallery-loading">
                    <Loader className="spin" size={40} />
                    <p>Загрузка NFT...</p>
                </div>
            ) : nfts.length === 0 ? (
                <div className="gallery-empty">
                    <Image size={64} />
                    <h2>NFT пока нет</h2>
                    <p>Создайте первый NFT!</p>
                </div>
            ) : (
                <>
                    <div className="nft-full-grid">
                        {paginatedNFTs.map(n => (
                            <NFTCard key={n.id} nft={n} onClick={() => setSelectedNFT(n)} />
                        ))}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="pagination">
                            <button
                                className="pagination-btn"
                                onClick={() => goToPage(currentPage - 1)}
                                disabled={currentPage === 1}
                            >
                                <ChevronLeft size={20} />
                            </button>

                            <div className="pagination-pages">
                                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                                    <button
                                        key={page}
                                        className={`pagination-page ${currentPage === page ? 'active' : ''}`}
                                        onClick={() => goToPage(page)}
                                    >
                                        {page}
                                    </button>
                                ))}
                            </div>

                            <button
                                className="pagination-btn"
                                onClick={() => goToPage(currentPage + 1)}
                                disabled={currentPage === totalPages}
                            >
                                <ChevronRight size={20} />
                            </button>
                        </div>
                    )}
                </>
            )}

            {/* NFT Detail Modal */}
            {selectedNFT && (
                <div className="nft-modal-overlay" onClick={() => setSelectedNFT(null)}>
                    <div className="nft-modal" onClick={e => e.stopPropagation()}>
                        <button className="modal-close" onClick={() => setSelectedNFT(null)}>
                            <X size={24} />
                        </button>

                        <img
                            src={selectedNFT.metadata.image.replace('ipfs://', 'https://gateway.lighthouse.storage/ipfs/')}
                            alt={selectedNFT.metadata.name}
                            className="modal-image"
                        />

                        <div className="modal-content">
                            <h2>{selectedNFT.metadata.name}</h2>
                            <p className="modal-desc">{selectedNFT.metadata.description || 'Нет описания'}</p>

                            <div className="modal-info">
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

                            {selectedNFT.metadata.attributes && selectedNFT.metadata.attributes.length > 0 && (
                                <div className="modal-attributes">
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
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
