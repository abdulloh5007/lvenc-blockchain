import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Library, Loader, Plus, Search } from 'lucide-react';
import { api } from '../api/client';
import type { NFTCollectionData } from '../api/client';
import { CollectionCard } from '../components/CollectionCard';
import { Button } from '../components/Button';
import { CreateCollectionModal } from '../components/CreateCollectionModal';
import './NFTCollections.css';
import { useI18n } from '../contexts/I18nContext';

export const NFTCollections: React.FC = () => {
    const [collections, setCollections] = useState<NFTCollectionData[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const navigate = useNavigate();
    const { t } = useI18n();

    const fetchCollections = async () => {
        try {
            setLoading(true);
            const response = await api.nft.getCollections();
            if (response.success && response.data) {
                setCollections(response.data);
            }
        } catch (error) {
            console.error('Failed to fetch collections:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCollections();
    }, []);

    const filteredCollections = collections.filter(collection =>
        collection.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        collection.symbol.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleCreateSuccess = () => {
        setShowCreateModal(false);
        fetchCollections();
    };

    return (
        <div className="collections-page fade-in">
            <div className="collections-header">
                <h1>{t('collections.title')}</h1>
                <span className="collections-count">{collections.length} {t('collections.items')}</span>
            </div>

            <div className="collections-controls">
                <div className="search-wrapper">
                    <Search size={18} className="search-icon" />
                    <input
                        type="text"
                        placeholder={t('collections.search')}
                        className="search-input"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <Button
                    variant="primary"
                    onClick={() => setShowCreateModal(true)}
                >
                    <Plus size={18} />
                    {t('collections.create')}
                </Button>
            </div>

            {loading ? (
                <div className="collections-loading">
                    <Loader className="spin" size={40} />
                    <p>{t('common.loading')}</p>
                </div>
            ) : filteredCollections.length > 0 ? (
                <div className="collections-grid">
                    {filteredCollections.map(collection => (
                        <CollectionCard
                            key={collection.id}
                            collection={collection}
                            onClick={(id) => navigate(`/nft/collections/${id}`)}
                        />
                    ))}
                </div>
            ) : (
                <div className="collections-empty">
                    <Library size={64} />
                    <h2>{searchTerm ? t('collections.noResults') : t('collections.empty')}</h2>
                    <Button variant="secondary" onClick={() => setShowCreateModal(true)}>
                        {t('collections.createFirst')}
                    </Button>
                </div>
            )}

            {showCreateModal && (
                <CreateCollectionModal
                    onClose={() => setShowCreateModal(false)}
                    onSuccess={handleCreateSuccess}
                />
            )}
        </div>
    );
};
