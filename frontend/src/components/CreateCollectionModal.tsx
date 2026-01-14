import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useWallets } from '../hooks/useWallets';
import { useI18n } from '../contexts/I18nContext';
import { Button } from './Button';
import { CustomSelect } from './CustomSelect';
import './CreateCollectionModal.css';

interface CreateCollectionModalProps {
    onClose: () => void;
    onSuccess: () => void;
}

export const CreateCollectionModal: React.FC<CreateCollectionModalProps> = ({ onClose, onSuccess }) => {
    const { wallets } = useWallets();
    const { t } = useI18n();
    const [name, setName] = useState('');
    const [symbol, setSymbol] = useState('');
    const [description, setDescription] = useState('');
    const [maxSupply, setMaxSupply] = useState('10000');
    const [selectedWallet, setSelectedWallet] = useState('');
    const [image, setImage] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Set default wallet when wallets load
    useEffect(() => {
        if (wallets.length > 0 && !selectedWallet) {
            setSelectedWallet(wallets[0].address);
        }
    }, [wallets, selectedWallet]);

    const walletOptions = wallets.map(w => ({
        value: w.address,
        label: w.label || `${w.address.substring(0, 10)}...${w.address.slice(-6)}`
    }));

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setImage(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            if (!selectedWallet) throw new Error(t('wallet.selectWallet') || 'Please select a creator wallet');
            if (!name) throw new Error('Name is required');
            if (!symbol) throw new Error('Symbol is required');

            let imageUrl = '';

            // Upload image to IPFS (Lighthouse) if selected - optional, will proceed without if fails
            if (image) {
                try {
                    // Convert file to base64
                    const reader = new FileReader();
                    const base64Promise = new Promise<string>((resolve, reject) => {
                        reader.onload = () => resolve(reader.result as string);
                        reader.onerror = reject;
                        reader.readAsDataURL(image);
                    });

                    const base64Data = await base64Promise;

                    // Upload to IPFS via our backend
                    const uploadRes = await api.ipfs.upload(base64Data, image.name);
                    if (uploadRes.success && uploadRes.data) {
                        imageUrl = uploadRes.data.gatewayUrl;
                    } else {
                        console.warn('Image upload failed, proceeding without image:', uploadRes.error);
                    }
                } catch (uploadErr) {
                    console.warn('Image upload error, proceeding without image:', uploadErr);
                    // Continue without image - collection will be created without cover image
                }
            }

            // Create collection
            const result = await api.nft.createCollection(
                name,
                symbol,
                selectedWallet,
                description,
                imageUrl,
                parseInt(maxSupply)
            );

            if (result.success) {
                onSuccess();
            } else {
                throw new Error(result.error || 'Failed to create collection');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-backdrop" onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
        }}>
            <div className="create-collection-modal">
                <div className="modal-header">
                    <h2 className="modal-title">{t('collections.modal.title')}</h2>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">{t('collections.modal.name')}</label>
                            <input
                                type="text"
                                className="form-input"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder={t('collections.modal.namePlaceholder')}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">{t('collections.modal.symbol')}</label>
                            <input
                                type="text"
                                className="form-input"
                                value={symbol}
                                onChange={(e) => setSymbol(e.target.value)}
                                placeholder={t('collections.modal.symbolPlaceholder')}
                                required
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">{t('collections.modal.description')}</label>
                        <textarea
                            className="form-textarea"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder={t('collections.modal.descPlaceholder')}
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">{t('collections.modal.image')}</label>
                        <div className="image-upload-area" onClick={() => document.getElementById('collection-image')?.click()}>
                            {imagePreview ? (
                                <img src={imagePreview} alt="Preview" className="upload-preview" />
                            ) : (
                                <div className="upload-placeholder">
                                    <span className="upload-icon">🖼️</span>
                                    <span>{t('collections.modal.clickUpload')}</span>
                                    <small>({t('collections.modal.supported')})</small>
                                </div>
                            )}
                            <input
                                id="collection-image"
                                type="file"
                                accept="image/*"
                                onChange={handleImageChange}
                                style={{ display: 'none' }}
                            />
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">{t('collections.modal.maxSupply')}</label>
                            <input
                                type="number"
                                className="form-input"
                                value={maxSupply}
                                onChange={(e) => setMaxSupply(e.target.value)}
                                min="1"
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">{t('collections.modal.creatorWallet')}</label>
                            <CustomSelect
                                options={walletOptions}
                                value={selectedWallet}
                                onChange={setSelectedWallet}
                                placeholder={t('wallet.selectWallet') || 'Select wallet...'}
                            />
                        </div>
                    </div>

                    {error && <div className="form-error">{error}</div>}

                    <div className="modal-footer">
                        <Button variant="secondary" onClick={onClose} type="button">
                            {t('collections.modal.cancel')}
                        </Button>
                        <Button variant="primary" type="submit" disabled={loading || !selectedWallet}>
                            {loading ? t('collections.modal.creating') : t('collections.modal.createBtn')}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};
