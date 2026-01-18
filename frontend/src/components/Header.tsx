import { useState } from 'react';
import { LayoutDashboard, Blocks, Wallet, FileText, Pickaxe, Globe, Link, Menu, X, Sun, Moon, Languages, Image, Sparkles } from 'lucide-react';
import { useTheme, useI18n } from '../contexts';
import './Header.css';

interface HeaderProps {
    currentPage: string;
    onNavigate: (page: string) => void;
}

const navItems = [
    { id: 'dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
    { id: 'blocks', labelKey: 'nav.blocks', icon: Blocks },
    { id: 'wallet', labelKey: 'nav.wallet', icon: Wallet },
    { id: 'transactions', labelKey: 'nav.transactions', icon: FileText },
    { id: 'mining', labelKey: 'nav.mining', icon: Pickaxe },
    { id: 'network', labelKey: 'nav.network', icon: Globe },
    { id: 'nft', labelKey: 'nav.nft', icon: Image },
    { id: 'nft-mint', labelKey: 'nav.nftMint', icon: Sparkles },
];

export const Header: React.FC<HeaderProps> = ({ currentPage, onNavigate }) => {
    const [menuOpen, setMenuOpen] = useState(false);
    const [langMenuOpen, setLangMenuOpen] = useState(false);
    const { theme, resolvedTheme, setTheme } = useTheme();
    const { locale, locales, t, setLocale } = useI18n();

    const handleNavigate = (page: string) => {
        onNavigate(page);
        setMenuOpen(false);
    };

    const toggleTheme = () => {
        setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
    };

    return (
        <>
            <header className="header">
                <div className="header-content">
                    <button className="hamburger-btn" onClick={() => setMenuOpen(!menuOpen)}>
                        {menuOpen ? <X size={24} /> : <Menu size={24} />}
                    </button>

                    <div className="logo">
                        <span className="logo-icon"><Link size={28} /></span>
                        <div className="logo-text">
                            <span className="logo-name">LVE Chain</span>
                            <span className="logo-subtitle">Educational Blockchain</span>
                        </div>
                    </div>

                    <nav className="nav desktop-nav">
                        {navItems.map((item) => {
                            const IconComponent = item.icon;
                            return (
                                <button
                                    key={item.id}
                                    className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
                                    onClick={() => onNavigate(item.id)}
                                >
                                    <span className="nav-icon"><IconComponent size={18} /></span>
                                    <span className="nav-label">{t(item.labelKey)}</span>
                                </button>
                            );
                        })}
                    </nav>

                    <div className="header-actions">
                        <button className="icon-btn" onClick={toggleTheme} title={t(`theme.${theme}`)}>
                            {theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
                        </button>

                        <div className="lang-dropdown">
                            <button className="icon-btn" onClick={() => setLangMenuOpen(!langMenuOpen)}>
                                <Languages size={20} />
                            </button>
                            {langMenuOpen && (
                                <div className="dropdown-menu" onMouseLeave={() => setLangMenuOpen(false)}>
                                    {locales.map(loc => (
                                        <button
                                            key={loc}
                                            className={`dropdown-item ${locale === loc ? 'active' : ''}`}
                                            onClick={() => { setLocale(loc); setLangMenuOpen(false); }}
                                        >
                                            {t(`language.${loc}`)}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="status-indicator online">
                            <span className="status-dot"></span>
                            <span className="status-text">{t('common.connected')}</span>
                        </div>
                    </div>
                </div>
            </header>

            <div className={`drawer-overlay ${menuOpen ? 'open' : ''}`} onClick={() => setMenuOpen(false)} />

            <div className={`mobile-drawer ${menuOpen ? 'open' : ''}`}>
                <div className="drawer-header">
                    <span className="logo-icon"><Link size={24} /></span>
                    <span className="drawer-title">LVE Chain</span>
                </div>
                <nav className="drawer-nav">
                    {navItems.map((item) => {
                        const IconComponent = item.icon;
                        return (
                            <button
                                key={item.id}
                                className={`drawer-item ${currentPage === item.id ? 'active' : ''}`}
                                onClick={() => handleNavigate(item.id)}
                            >
                                <span className="drawer-icon"><IconComponent size={20} /></span>
                                <span className="drawer-label">{t(item.labelKey)}</span>
                            </button>
                        );
                    })}
                </nav>
                <div className="drawer-footer">
                    <button className="drawer-action" onClick={toggleTheme}>
                        {theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
                        <span>{t(`theme.${theme}`)}</span>
                    </button>
                    <div className="drawer-langs">
                        {locales.map(loc => (
                            <button
                                key={loc}
                                className={`lang-btn ${locale === loc ? 'active' : ''}`}
                                onClick={() => setLocale(loc)}
                            >
                                {loc.toUpperCase()}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </>
    );
};
