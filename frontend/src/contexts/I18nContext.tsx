import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

type Translations = Record<string, Record<string, string>>;

interface I18nContextType {
    locale: string;
    locales: string[];
    t: (key: string) => string;
    setLocale: (locale: string) => void;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

const getCookie = (name: string): string | null => {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? match[2] : null;
};

const setCookie = (name: string, value: string, days = 365) => {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${name}=${value}; expires=${expires}; path=/; SameSite=Lax`;
};

export const useI18n = () => {
    const context = useContext(I18nContext);
    if (!context) throw new Error('useI18n must be used within I18nProvider');
    return context;
};

const localeModules = import.meta.glob('../locales/*.json', { eager: true }) as Record<string, { default: Translations }>;

const loadedLocales: Record<string, Translations> = {};
const availableLocales: string[] = [];

Object.keys(localeModules).forEach(path => {
    const match = path.match(/\/(\w+)\.json$/);
    if (match) {
        const locale = match[1];
        availableLocales.push(locale);
        loadedLocales[locale] = (localeModules[path] as any).default || localeModules[path];
    }
});

const flattenObject = (obj: any, prefix = ''): Record<string, string> => {
    const result: Record<string, string> = {};
    for (const key in obj) {
        const newKey = prefix ? `${prefix}.${key}` : key;
        if (typeof obj[key] === 'object' && obj[key] !== null) {
            Object.assign(result, flattenObject(obj[key], newKey));
        } else {
            result[newKey] = obj[key];
        }
    }
    return result;
};

const detectLocale = (): string => {
    const saved = getCookie('locale');
    if (saved && availableLocales.includes(saved)) return saved;

    const browserLang = navigator.language.split('-')[0];
    if (availableLocales.includes(browserLang)) return browserLang;

    return 'ru';
};

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [locale, setLocaleState] = useState<string>(detectLocale);

    const [translations, setTranslations] = useState<Record<string, string>>(() => {
        return flattenObject(loadedLocales[locale] || loadedLocales['ru'] || {});
    });

    useEffect(() => {
        const data = loadedLocales[locale] || loadedLocales['ru'] || {};
        setTranslations(flattenObject(data));
        setCookie('locale', locale);
        document.documentElement.setAttribute('lang', locale);
    }, [locale]);

    const t = useCallback((key: string): string => {
        return translations[key] || key;
    }, [translations]);

    const setLocale = (newLocale: string) => {
        if (availableLocales.includes(newLocale)) {
            setLocaleState(newLocale);
        }
    };

    return (
        <I18nContext.Provider value={{ locale, locales: availableLocales, t, setLocale }}>
            {children}
        </I18nContext.Provider>
    );
};
