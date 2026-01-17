import React, { useState, useEffect } from 'react';
import { Sparkles, Image, Plus, X, Upload, Globe, Loader } from 'lucide-react';
import { Card, Button, Input, CustomSelect } from '../components';
import { useWallets } from '../hooks';
import { usePinContext } from '../contexts';
import { nft, ipfs } from '../api/client';
import type { NFTMetadata, NFTAttribute, IPFSStatus } from '../api/client';
import './NFT.css';

export const NFTMint: React.FC = () => {
    const { wallets } = useWallets();
    const { confirmPin } = usePinContext();
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [ipfsStatus, setIpfsStatus] = useState<IPFSStatus | null>(null);

    const [selectedWallet, setSelectedWallet] = useState('');
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [imageData, setImageData] = useState(''); // Base64 data URL - NOT uploaded yet
    const [imageFileName, setImageFileName] = useState('');
    const [royalty, setRoyalty] = useState(5);
    const [attributes, setAttributes] = useState<NFTAttribute[]>([]);
    const [newAttrType, setNewAttrType] = useState('');
    const [newAttrValue, setNewAttrValue] = useState('');
    const [mintStep, setMintStep] = useState<'idle' | 'uploading' | 'minting'>('idle');

    // Check IPFS status on mount
    useEffect(() => {
        const checkIPFS = async () => {
            const res = await ipfs.status();
            if (res.success && res.data) {
                setIpfsStatus(res.data);
            }
        };
        checkIPFS();
    }, []);

    // Handle image selection - ONLY store locally, NO IPFS upload
    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 2 * 1024 * 1024) {
            setMessage({ type: 'error', text: 'Изображение должно быть меньше 2MB' });
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const base64Data = event.target?.result as string;
            setImageData(base64Data);
            setImageFileName(file.name);
            setMessage(null);
        };
        reader.readAsDataURL(file);
    };

    const addAttribute = () => {
        if (newAttrType && newAttrValue) {
            setAttributes([...attributes, { trait_type: newAttrType, value: newAttrValue }]);
            setNewAttrType('');
            setNewAttrValue('');
        }
    };

    const removeAttribute = (index: number) => {
        setAttributes(attributes.filter((_, i) => i !== index));
    };

    const clearImage = () => {
        setImageData('');
        setImageFileName('');
    };

    const handleMint = async () => {
        if (!selectedWallet || !name || !imageData) {
            setMessage({ type: 'error', text: 'Заполните все обязательные поля' });
            return;
        }

        // Confirm with PIN instead of asking for mnemonic
        const confirmed = await confirmPin('Подтвердите создание NFT', `Создать "${name}" с вашего кошелька?`);
        if (!confirmed) {
            setMessage({ type: 'error', text: 'Отменено пользователем' });
            return;
        }

        setLoading(true);
        let imageUrl = imageData;

        // Step 1: Upload to IPFS if available
        if (ipfsStatus?.connected) {
            setMintStep('uploading');
            const uploadRes = await ipfs.upload(imageData, imageFileName || 'nft-image.png');
            if (uploadRes.success && uploadRes.data) {
                imageUrl = `ipfs://${uploadRes.data.cid}`;
            } else {
                setMessage({ type: 'error', text: uploadRes.error || 'Ошибка загрузки в IPFS' });
                setLoading(false);
                setMintStep('idle');
                return;
            }
        }

        // Step 2: Mint NFT
        setMintStep('minting');

        const metadata: NFTMetadata = {
            name,
            description,
            image: imageUrl,
            attributes,
        };

        // Get the wallet's mnemonic from the stored wallets
        const wallet = wallets.find(w => w.address === selectedWallet);
        if (!wallet) {
            setMessage({ type: 'error', text: 'Кошелёк не найден' });
            setLoading(false);
            setMintStep('idle');
            return;
        }

        const res = await nft.mint(selectedWallet, metadata, wallet.mnemonic, undefined, royalty);

        if (res.success && res.data) {
            setMessage({ type: 'success', text: `NFT #${res.data.tokenId} создан!` });
            // Clear form
            setName('');
            setDescription('');
            setImageData('');
            setImageFileName('');
            setAttributes([]);
            setRoyalty(5);
        } else {
            setMessage({ type: 'error', text: res.error || 'Ошибка создания NFT' });
        }
        setLoading(false);
        setMintStep('idle');
    };

    const getMintButtonText = () => {
        if (mintStep === 'uploading') return 'Загрузка в IPFS...';
        if (mintStep === 'minting') return 'Создание NFT...';
        return 'Создать NFT';
    };

    return (
        <div className="nft-page fade-in">
            <div className="page-header">
                <h1><Sparkles className="header-icon" /> Создать NFT</h1>
            </div>

            {/* IPFS Status */}
            <div className={`ipfs-status ${ipfsStatus?.connected ? 'connected' : 'disconnected'}`}>
                <Globe size={16} />
                <span>IPFS: {ipfsStatus?.connected ? 'Подключено' : 'Не подключено'}</span>
                {!ipfsStatus?.connected && <span className="hint">(изображения будут в base64)</span>}
            </div>

            {message && (
                <div className={`message ${message.type}`}>
                    {message.text}
                    <button onClick={() => setMessage(null)}>×</button>
                </div>
            )}

            <div className="mint-content">
                <Card title="Изображение" icon={<Image size={20} />} className="mint-image-card">
                    <div className="image-upload-container">
                        {imageData ? (
                            <div className="image-preview">
                                <img src={imageData} alt="Preview" />
                                <div className="preview-badge">Превью</div>
                                <button className="remove-image" onClick={clearImage}>
                                    <X size={16} />
                                </button>
                            </div>
                        ) : (
                            <label className="image-upload-area">
                                <input type="file" accept="image/*" onChange={handleImageSelect} hidden />
                                <Upload size={32} />
                                <span>Загрузить изображение</span>
                                <span className="hint">PNG, JPG, GIF (макс. 2MB)</span>
                            </label>
                        )}
                    </div>
                    {imageData && (
                        <div className="upload-info">
                            <span className="hint">⚡ Загрузка в IPFS произойдёт при создании NFT</span>
                        </div>
                    )}
                </Card>

                <Card title="Детали NFT" icon={<Sparkles size={20} />} className="mint-details-card">
                    <div className="mint-form">
                        <div className="form-group">
                            <label>Кошелёк создателя *</label>
                            <CustomSelect
                                options={[
                                    { value: '', label: 'Выберите кошелёк' },
                                    ...wallets.map(w => ({
                                        value: w.address,
                                        label: `${w.label || 'Wallet'} (${w.address.slice(0, 10)}...)`
                                    }))
                                ]}
                                value={selectedWallet}
                                onChange={setSelectedWallet}
                                placeholder="Выберите кошелёк"
                            />
                        </div>

                        <Input label="Название *" placeholder="My Cool NFT" value={name} onChange={e => setName(e.target.value)} />

                        <div className="form-group">
                            <label>Описание</label>
                            <textarea placeholder="Опишите ваш NFT..." value={description} onChange={e => setDescription(e.target.value)} rows={3} />
                        </div>

                        <Input label="Роялти (%)" type="number" min={0} max={10} value={royalty.toString()} onChange={e => setRoyalty(parseInt(e.target.value) || 0)} />

                        <div className="attributes-section">
                            <label>Атрибуты</label>
                            <div className="attributes-list">
                                {attributes.map((attr, i) => (
                                    <div key={i} className="attribute-tag">
                                        <span>{attr.trait_type}: {attr.value}</span>
                                        <button onClick={() => removeAttribute(i)}><X size={12} /></button>
                                    </div>
                                ))}
                            </div>
                            <div className="add-attribute">
                                <input placeholder="Тип" value={newAttrType} onChange={e => setNewAttrType(e.target.value)} />
                                <input placeholder="Значение" value={newAttrValue} onChange={e => setNewAttrValue(e.target.value)} />
                                <Button size="sm" variant="ghost" onClick={addAttribute}><Plus size={16} /></Button>
                            </div>
                        </div>

                        <Button onClick={handleMint} loading={loading} disabled={!selectedWallet || !name || !imageData}>
                            {loading ? <Loader size={16} className="spin" /> : <Sparkles size={16} />}
                            {getMintButtonText()}
                        </Button>
                    </div>
                </Card>
            </div>
        </div>
    );
};
