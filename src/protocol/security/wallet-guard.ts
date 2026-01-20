import { logger } from '../utils/logger.js';

const knownPhishingDomains = new Set([
    'metamask-wallet.io', 'trustwallet-app.com', 'phantom-wallet.org',
    'uniswap-exchange.com', 'opensea-nft.io', 'coinbase-wallet.net'
]);

const suspiciousPatterns = [
    /wallet.*connect/i, /claim.*airdrop/i, /free.*mint/i,
    /metamask|phantom|trustwallet/i, /urgent.*action/i
];

const blacklistedAddresses = new Set<string>();
const whitelistedAddresses = new Set<string>();
const addressLabels = new Map<string, string>();

export function isPhishingDomain(domain: string): boolean {
    const lower = domain.toLowerCase();
    if (knownPhishingDomains.has(lower)) return true;
    for (const legit of ['metamask.io', 'phantom.app', 'opensea.io', 'uniswap.org']) {
        if (lower.includes(legit.split('.')[0]) && lower !== legit) return true;
    }
    return false;
}

export function isSuspiciousMessage(message: string): boolean {
    return suspiciousPatterns.some(p => p.test(message));
}

export function validateSigningMessage(message: string): { safe: boolean; reason?: string } {
    if (isSuspiciousMessage(message)) {
        return { safe: false, reason: 'Suspicious message content' };
    }
    if (message.length > 1000) {
        return { safe: false, reason: 'Message too long' };
    }
    return { safe: true };
}

export function blacklistAddress(address: string): void {
    blacklistedAddresses.add(address.toLowerCase());
    logger.warn(`🚫 Address blacklisted: ${address}`);
}

export function isBlacklisted(address: string): boolean {
    return blacklistedAddresses.has(address.toLowerCase());
}

export function whitelistAddress(address: string): void {
    whitelistedAddresses.add(address.toLowerCase());
}

export function isWhitelisted(address: string): boolean {
    return whitelistedAddresses.has(address.toLowerCase());
}

export function labelAddress(address: string, label: string): void {
    addressLabels.set(address.toLowerCase(), label);
}

export function getAddressLabel(address: string): string | null {
    return addressLabels.get(address.toLowerCase()) || null;
}

export function validateAddressChange(original: string, current: string): boolean {
    if (original.toLowerCase() !== current.toLowerCase()) {
        logger.warn(`🚨 Clipboard hijack detected: ${original} → ${current}`);
        return false;
    }
    return true;
}

export function sanitizeClipboardAddress(address: string): string {
    return address.replace(/[^a-zA-Z0-9]/g, '');
}

const recentTransfers = new Map<string, { count: number; firstTime: number }>();
const TRANSFER_WINDOW = 60 * 60 * 1000;
const MAX_TRANSFERS_PER_HOUR = 50;

export function checkTransferRate(address: string): boolean {
    const now = Date.now();
    const record = recentTransfers.get(address);
    if (!record || now - record.firstTime > TRANSFER_WINDOW) {
        recentTransfers.set(address, { count: 1, firstTime: now });
        return true;
    }
    record.count++;
    if (record.count > MAX_TRANSFERS_PER_HOUR) {
        logger.warn(`🚨 Rate limit exceeded: ${address}`);
        return false;
    }
    return true;
}

const SEED_PHRASE_PATTERNS = [
    /\b(seed|phrase|mnemonic|secret|recovery)\b/i,
    /\b\d{1,2}\.\s*[a-z]+\b/i
];

export function containsSeedPhrase(text: string): boolean {
    const words = text.trim().split(/\s+/);
    if (words.length >= 12 && words.length <= 24 && words.every(w => /^[a-z]+$/.test(w))) {
        logger.warn('🚨 Potential seed phrase detected');
        return true;
    }
    return SEED_PHRASE_PATTERNS.some(p => p.test(text));
}

export function detectPhishingUrl(url: string): { safe: boolean; reason?: string } {
    try {
        const parsed = new URL(url);
        if (isPhishingDomain(parsed.hostname)) {
            return { safe: false, reason: 'Known phishing domain' };
        }
        if (parsed.hostname.includes('xn--')) {
            return { safe: false, reason: 'Punycode domain (possible homograph)' };
        }
        return { safe: true };
    } catch {
        return { safe: false, reason: 'Invalid URL' };
    }
}

setInterval(() => {
    const now = Date.now();
    for (const [addr, rec] of recentTransfers) {
        if (now - rec.firstTime > TRANSFER_WINDOW) recentTransfers.delete(addr);
    }
}, 10 * 60 * 1000);
