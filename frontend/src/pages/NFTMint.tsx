import React, { useState, useEffect } from 'react';
import { Sparkles, Image, Plus, X, Upload, Globe } from 'lucide-react';
import { Card, Button, Input } from '../components';
import { useWallets } from '../hooks';
import { nft, ipfs } from '../api/client';
import type { NFTMetadata, NFTAttribute, IPFSStatus } from '../api/client';
import './NFT.css';

export const NFTMint: React.FC = () => {
    const { wallets } = useWallets();
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [ipfsStatus, setIpfsStatus] = useState<IPFSStatus | null>(null);

    const [selectedWallet, setSelectedWallet] = useState('');
    const [seedPhrase, setSeedPhrase] = useState('');
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [imageData, setImageData] = useState('');
    const [imageCid, setImageCid] = useState('');
    const [royalty, setRoyalty] = useState(5);
    const [attributes, setAttributes] = useState<NFTAttribute[]>([]);
    const [newAttrType, setNewAttrType] = useState('');
    const [newAttrValue, setNewAttrValue] = useState('');

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

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 2 * 1024 * 1024) {
            setMessage({ type: 'error', text: 'Изображение должно быть меньше 2MB' });
            return;
        }

        const reader = new FileReader();
        reader.onload = async (event) => {
            const base64Data = event.target?.result as string;
            setImageData(base64Data);

            // If IPFS is available, upload automatically
            if (ipfsStatus?.connected) {
                setUploading(true);
                const uploadRes = await ipfs.upload(base64Data, file.name);
                if (uploadRes.success && uploadRes.data) {
                    setImageCid(uploadRes.data.cid);
                    setMessage({ type: 'success', text: `Загружено в IPFS: ${uploadRes.data.cid.slice(0, 12)}...` });
                }
                setUploading(false);
            }
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

    const handleMint = async () => {
        if (!selectedWallet || !seedPhrase || !name || !imageData) {
            setMessage({ type: 'error', text: 'Заполните все обязательные поля' });
            return;
        }

        setLoading(true);

        // Use IPFS URL if available, otherwise base64
        const imageUrl = imageCid ? `ipfs://${imageCid}` : imageData;

        const metadata: NFTMetadata = {
            name,
            description,
            image: imageUrl,
            attributes,
        };

        const res = await nft.mint(selectedWallet, metadata, seedPhrase.trim(), undefined, royalty);

        if (res.success && res.data) {
            setMessage({ type: 'success', text: `NFT #${res.data.tokenId} создан!` });
            setName('');
            setDescription('');
            setImageData('');
            setImageCid('');
            setAttributes([]);
            setSeedPhrase('');
        } else {
            setMessage({ type: 'error', text: res.error || 'Ошибка создания NFT' });
        }
        setLoading(false);
    };

    return (
        <div className="nft-page fade-in">
            <div className="page-header">
                <h1><Sparkles className="header-icon" /> Создать NFT</h1>
                <p>Минтинг уникального цифрового актива</p>
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
                                {uploading && <div className="upload-overlay">Загрузка в IPFS...</div>}
                                {imageCid && (
                                    <div className="ipfs-badge">
                                        <Globe size={12} /> IPFS
                                    </div>
                                )}
                                <button className="remove-image" onClick={() => { setImageData(''); setImageCid(''); }}>
                                    <X size={16} />
                                </button>
                            </div>
                        ) : (
                            <label className="image-upload-area">
                                <input type="file" accept="image/*" onChange={handleImageUpload} hidden />
                                <Upload size={32} />
                                <span>Загрузить изображение</span>
                                <span className="hint">PNG, JPG, GIF (макс. 2MB)</span>
                            </label>
                        )}
                    </div>
                    {imageCid && (
                        <div className="cid-display">
                            <span className="label">CID:</span>
                            <code>{imageCid}</code>
                        </div>
                    )}
                </Card>

                <Card title="Детали NFT" icon={<Sparkles size={20} />} className="mint-details-card">
                    <div className="mint-form">
                        <div className="form-group">
                            <label>Кошелёк создателя *</label>
                            <select value={selectedWallet} onChange={e => setSelectedWallet(e.target.value)}>
                                <option value="">Выберите кошелёк</option>
                                {wallets.map(w => (
                                    <option key={w.address} value={w.address}>
                                        {w.label || 'Wallet'} ({w.address.slice(0, 10)}...)
                                    </option>
                                ))}
                            </select>
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

                        <div className="seed-input">
                            <label>Seed-фраза *</label>
                            <textarea placeholder="Введите 15 слов seed-фразы..." value={seedPhrase} onChange={e => setSeedPhrase(e.target.value)} rows={2} />
                        </div>

                        <Button onClick={handleMint} loading={loading} disabled={!selectedWallet || !name || !imageData || uploading}>
                            <Sparkles size={16} /> Создать NFT
                        </Button>
                    </div>
                </Card>
            </div>
        </div>
    );
};
