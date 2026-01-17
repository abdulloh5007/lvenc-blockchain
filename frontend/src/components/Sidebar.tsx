import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Blocks, Wallet, Globe, X, ChevronRight, ChevronLeft, Menu, Sun, Moon, Languages, FileText, Coins, Image } from 'lucide-react';
import { useTheme, useI18n } from '../contexts';
import './Sidebar.css';

interface SidebarProps {
    onNavigate?: (page: string) => void;
}

const navigation = [
    { id: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard },
    { id: '/blocks', labelKey: 'nav.blocks', icon: Blocks },
    { id: '/transactions', labelKey: 'nav.transactions', icon: FileText },
    { id: '/wallet', labelKey: 'nav.wallet', icon: Wallet },
    { id: '/staking', labelKey: 'nav.staking', icon: Coins },
    { id: '/nft', labelKey: 'nav.nft', icon: Image },
    { id: '/network', labelKey: 'nav.network', icon: Globe },
];

const languages = [
    { code: 'en', label: 'English' },
    { code: 'ru', label: 'Русский' },
    { code: 'uz', label: "O'zbek" },
];

export const Sidebar: React.FC<SidebarProps> = () => {
    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [langMenuOpen, setLangMenuOpen] = useState(false);
    const { theme, setTheme } = useTheme();
    const { t, locale, setLocale } = useI18n();
    const navigate = useNavigate();
    const location = useLocation();

    const handleNavigate = (path: string) => {
        navigate(path);
        setMobileOpen(false);
    };

    const isActive = (path: string) => {
        if (path === '/') return location.pathname === '/';
        return location.pathname.startsWith(path);
    };

    const closeMobile = () => setMobileOpen(false);

    return (
        <>
            {/* Mobile Menu Button - Always visible on mobile */}
            <button className="mobile-menu-toggle" onClick={() => setMobileOpen(true)}>
                <Menu size={24} />
            </button>

            {/* Mobile Overlay */}
            {mobileOpen && (
                <div className="mobile-overlay" onClick={closeMobile} />
            )}

            {/* Sidebar */}
            <div className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
                <div className="sidebar-header">
                    {!collapsed && <span className="logo-text">EDU Chain</span>}

                    {/* Desktop collapse button */}
                    <button className="collapse-btn desktop-only" onClick={() => setCollapsed(!collapsed)}>
                        {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                    </button>

                    {/* Mobile close button */}
                    <button className="close-btn mobile-only" onClick={closeMobile}>
                        <X size={20} />
                    </button>
                </div>

                <nav className="sidebar-nav">
                    {navigation.map((item) => (
                        <button
                            key={item.id}
                            className={`nav-item ${isActive(item.id) ? 'active' : ''}`}
                            onClick={() => handleNavigate(item.id)}
                            title={collapsed ? t(item.labelKey) : ''}
                        >
                            <item.icon size={18} />
                            {!collapsed && <span>{t(item.labelKey) || item.id.replace('/', '')}</span>}
                        </button>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    {/* Theme Toggle */}
                    <button
                        className="footer-btn"
                        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                        title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
                    >
                        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                        {!collapsed && <span>{theme === 'dark' ? t('common.light') || 'Light' : t('common.dark') || 'Dark'}</span>}
                    </button>

                    {/* Language Selector */}
                    <div className="lang-menu-container">
                        <button
                            className="footer-btn"
                            onClick={() => setLangMenuOpen(!langMenuOpen)}
                            title="Language"
                        >
                            <Languages size={18} />
                            {!collapsed && <span>{languages.find(l => l.code === locale)?.label || 'Language'}</span>}
                        </button>

                        {langMenuOpen && (
                            <div className="lang-dropdown">
                                {languages.map((lang) => (
                                    <button
                                        key={lang.code}
                                        className={`lang-option ${locale === lang.code ? 'active' : ''}`}
                                        onClick={() => {
                                            setLocale(lang.code);
                                            setLangMenuOpen(false);
                                        }}
                                    >
                                        {lang.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};
