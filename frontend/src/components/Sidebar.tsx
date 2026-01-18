import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Blocks, Wallet, FileText, Globe, Image, Sparkles, Sun, Moon, Monitor, Languages, ChevronLeft, ChevronRight, Menu, X, Library, Coins } from 'lucide-react';
import { useTheme, useI18n } from '../contexts';
import './Sidebar.css';

interface SidebarProps {
    collapsed: boolean;
    setCollapsed: (val: boolean) => void;
}

const navGroups = [
    {
        title: 'Overview',
        titleKey: 'nav.overview',
        items: [
            { id: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard },
            { id: '/blocks', labelKey: 'nav.blocks', icon: Blocks },
            { id: '/transactions', labelKey: 'nav.transactions', icon: FileText },
        ],
    },
    {
        title: 'Wallet',
        titleKey: 'nav.walletGroup',
        items: [
            { id: '/wallet', labelKey: 'nav.wallet', icon: Wallet },
            { id: '/staking', labelKey: 'nav.staking', icon: Coins },
            { id: '/swap', labelKey: 'Swap', icon: Coins },
        ],
    },
    {
        title: 'NFT',
        titleKey: 'nav.nftGroup',
        items: [
            { id: '/nft', labelKey: 'nav.nft', icon: Image },
            { id: '/nft/collections', labelKey: 'nav.collections', icon: Library },
            { id: '/nft/mint', labelKey: 'nav.nftMint', icon: Sparkles },
        ],
    },
    {
        title: 'Network',
        titleKey: 'nav.networkGroup',
        items: [
            { id: '/network', labelKey: 'nav.network', icon: Globe },
        ],
    },
];

export const Sidebar: React.FC<SidebarProps> = ({ collapsed, setCollapsed }) => {
    const [mobileOpen, setMobileOpen] = useState(false);
    const [langMenuOpen, setLangMenuOpen] = useState(false);
    const [themeMenuOpen, setThemeMenuOpen] = useState(false);
    const { theme, resolvedTheme, setTheme } = useTheme();
    const { locale, locales, t, setLocale } = useI18n();
    const navigate = useNavigate();
    const location = useLocation();
    const langMenuRef = useRef<HTMLDivElement>(null);
    const themeMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (langMenuRef.current && !langMenuRef.current.contains(event.target as Node)) {
                setLangMenuOpen(false);
            }
            if (themeMenuRef.current && !themeMenuRef.current.contains(event.target as Node)) {
                setThemeMenuOpen(false);
            }
        };

        if (langMenuOpen || themeMenuOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [langMenuOpen, themeMenuOpen]);

    const getThemeIcon = () => {
        if (theme === 'system') return <Monitor size={20} />;
        return resolvedTheme === 'dark' ? <Moon size={20} /> : <Sun size={20} />;
    };

    const getThemeLabel = () => {
        if (theme === 'system') return t('theme.system') || 'Система';
        if (theme === 'dark') return t('theme.dark') || 'Тёмная';
        return t('theme.light') || 'Светлая';
    };

    const handleNavigate = (path: string) => {
        navigate(path);
        setMobileOpen(false);
    };

    return (
        <>
            {/* Mobile Menu Toggle - Single button that transforms */}
            <button
                className={`mobile-menu-toggle ${mobileOpen ? 'open' : ''}`}
                onClick={() => setMobileOpen(!mobileOpen)}
            >
                <span className="toggle-icon menu-icon"><Menu size={24} /></span>
                <span className="toggle-icon close-icon"><X size={24} /></span>
            </button>

            {/* Mobile Overlay */}
            <div className={`mobile-overlay ${mobileOpen ? 'open' : ''}`} onClick={() => setMobileOpen(false)} />

            <div className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
                <div className="sidebar-header">
                    {!collapsed && <span className="logo-text">EDU Chain</span>}
                    <button className="collapse-btn desktop-only" onClick={() => setCollapsed(!collapsed)}>
                        {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
                    </button>
                </div>

                <nav className="sidebar-nav">
                    {navGroups.map((group, groupIndex) => (
                        <div key={groupIndex} className="nav-group">
                            {!collapsed && <h3 className="group-title">{t(group.titleKey) || group.title}</h3>}
                            {group.items.map((item) => {
                                const isActive = location.pathname === item.id ||
                                    (item.id !== '/' && item.id !== '/nft' && location.pathname.startsWith(item.id + '/'));
                                return (
                                    <button
                                        key={item.id}
                                        className={`nav-item ${isActive ? 'active' : ''}`}
                                        onClick={() => handleNavigate(item.id)}
                                        title={collapsed ? (t(item.labelKey) || item.labelKey) : ''}
                                    >
                                        <item.icon size={20} />
                                        {!collapsed && <span>{t(item.labelKey) || item.labelKey}</span>}
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <div className="footer-actions">
                        <div className="lang-menu-container" ref={langMenuRef}>
                            <button
                                className="footer-btn"
                                onClick={() => setLangMenuOpen(!langMenuOpen)}
                                title={t('common.language') || 'Language'}
                            >
                                <Languages size={20} />
                                {!collapsed && <span className="lang-code">{locale.toUpperCase()}</span>}
                            </button>
                            {langMenuOpen && (
                                <div className="lang-dropdown">
                                    {locales.map(l => (
                                        <button
                                            key={l}
                                            className={`lang-option ${locale === l ? 'active' : ''}`}
                                            onClick={() => {
                                                setLocale(l);
                                                setLangMenuOpen(false);
                                            }}
                                        >
                                            {l.toUpperCase()}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="theme-menu-container" ref={themeMenuRef}>
                            <button
                                className="footer-btn"
                                onClick={() => setThemeMenuOpen(!themeMenuOpen)}
                                title={getThemeLabel()}
                            >
                                {getThemeIcon()}
                                {!collapsed && <span>{getThemeLabel()}</span>}
                            </button>
                            {themeMenuOpen && (
                                <div className="theme-dropdown">
                                    <button
                                        className={`theme-option ${theme === 'light' ? 'active' : ''}`}
                                        onClick={() => { setTheme('light'); setThemeMenuOpen(false); }}
                                    >
                                        <Sun size={16} /> {t('theme.light') || 'Светлая'}
                                    </button>
                                    <button
                                        className={`theme-option ${theme === 'dark' ? 'active' : ''}`}
                                        onClick={() => { setTheme('dark'); setThemeMenuOpen(false); }}
                                    >
                                        <Moon size={16} /> {t('theme.dark') || 'Тёмная'}
                                    </button>
                                    <button
                                        className={`theme-option ${theme === 'system' ? 'active' : ''}`}
                                        onClick={() => { setTheme('system'); setThemeMenuOpen(false); }}
                                    >
                                        <Monitor size={16} /> {t('theme.system') || 'Система'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};
