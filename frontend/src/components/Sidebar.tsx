import { useState } from 'react';
import { LayoutDashboard, Blocks, Wallet, FileText, Pickaxe, Globe, Image, Sparkles, Sun, Moon, Languages, ChevronLeft, ChevronRight, Menu, X } from 'lucide-react';
import { useTheme, useI18n } from '../contexts';
import './Sidebar.css';

interface SidebarProps {
    currentPage: string;
    onNavigate: (page: string) => void;
}

const navGroups = [
    {
        title: 'Overview',
        titleKey: 'nav.overview',
        items: [
            { id: 'dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
            { id: 'blocks', labelKey: 'nav.blocks', icon: Blocks },
            { id: 'transactions', labelKey: 'nav.transactions', icon: FileText },
        ],
    },
    {
        title: 'Wallet',
        titleKey: 'nav.walletGroup',
        items: [
            { id: 'wallet', labelKey: 'nav.wallet', icon: Wallet },
            { id: 'mining', labelKey: 'nav.mining', icon: Pickaxe },
        ],
    },
    {
        title: 'NFT',
        titleKey: 'nav.nftGroup',
        items: [
            { id: 'nft', labelKey: 'nav.nft', icon: Image },
            { id: 'nft-mint', labelKey: 'nav.nftMint', icon: Sparkles },
        ],
    },
    {
        title: 'Network',
        titleKey: 'nav.networkGroup',
        items: [
            { id: 'network', labelKey: 'nav.network', icon: Globe },
        ],
    },
];

export const Sidebar: React.FC<SidebarProps> = ({ currentPage, onNavigate }) => {
    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [langMenuOpen, setLangMenuOpen] = useState(false);
    const { theme, setTheme } = useTheme();
    const { locale, locales, t, setLocale } = useI18n();

    const toggleTheme = () => {
        setTheme(theme === 'dark' ? 'light' : 'dark');
    };

    const handleNavigate = (page: string) => {
        onNavigate(page);
        setMobileOpen(false); // Close mobile menu on navigate
    };

    // Translation with fallback
    const translate = (key: string, fallback: string) => {
        const result = t(key);
        return result && result !== key ? result : fallback;
    };

    return (
        <>
            {/* Mobile menu button */}
            <button className="mobile-menu-btn" onClick={() => setMobileOpen(!mobileOpen)}>
                {mobileOpen ? <X size={24} /> : <Menu size={24} />}
            </button>

            {/* Overlay for mobile */}
            {mobileOpen && <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />}

            <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
                <div className="sidebar-header">
                    <div className="logo">
                        <span className="logo-icon">⛓️</span>
                        {!collapsed && <span className="logo-text">EDU Chain</span>}
                    </div>
                    <button className="collapse-btn desktop-only" onClick={() => setCollapsed(!collapsed)}>
                        {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                    </button>
                    <button className="close-mobile-btn mobile-only" onClick={() => setMobileOpen(false)}>
                        <X size={20} />
                    </button>
                </div>

                <nav className="sidebar-nav">
                    {navGroups.map((group, groupIndex) => (
                        <div key={groupIndex} className="nav-group">
                            {!collapsed && (
                                <div className="nav-group-title">
                                    {translate(group.titleKey, group.title)}
                                </div>
                            )}
                            {group.items.map((item) => {
                                const IconComponent = item.icon;
                                return (
                                    <button
                                        key={item.id}
                                        className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
                                        onClick={() => handleNavigate(item.id)}
                                        title={collapsed ? t(item.labelKey) : undefined}
                                    >
                                        <span className="nav-icon"><IconComponent size={18} /></span>
                                        {!collapsed && <span className="nav-label">{t(item.labelKey)}</span>}
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <button className="footer-btn" onClick={toggleTheme} title={t(`theme.${theme}`)}>
                        {theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
                        {!collapsed && <span>{theme === 'dark' ? t('theme.dark') : t('theme.light')}</span>}
                    </button>

                    <div className="lang-select">
                        <button className="footer-btn" onClick={() => setLangMenuOpen(!langMenuOpen)}>
                            <Languages size={18} />
                            {!collapsed && <span>{t(`language.${locale}`)}</span>}
                        </button>
                        {langMenuOpen && (
                            <div className="lang-dropdown" onMouseLeave={() => setLangMenuOpen(false)}>
                                {locales.map(loc => (
                                    <button
                                        key={loc}
                                        className={`lang-option ${locale === loc ? 'active' : ''}`}
                                        onClick={() => { setLocale(loc); setLangMenuOpen(false); }}
                                    >
                                        {t(`language.${loc}`)}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </aside>
        </>
    );
};
