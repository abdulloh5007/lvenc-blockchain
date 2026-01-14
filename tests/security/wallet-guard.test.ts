import { describe, it, expect } from 'vitest';
import { isPhishingDomain, isSuspiciousMessage, validateSigningMessage, isBlacklisted, blacklistAddress, whitelistAddress, isWhitelisted, validateAddressChange, containsSeedPhrase, detectPhishingUrl } from '../../src/security/wallet-guard';

describe('Phishing Detection', () => {
    it('detects known phishing domains', () => {
        expect(isPhishingDomain('metamask-wallet.io')).toBe(true);
    });
    it('allows legitimate domains', () => {
        expect(isPhishingDomain('example.com')).toBe(false);
    });
    it('detects lookalike domains', () => {
        expect(isPhishingDomain('metamask-app.com')).toBe(true);
    });
});

describe('Suspicious Messages', () => {
    it('detects claim airdrop scam', () => {
        expect(isSuspiciousMessage('Claim your free airdrop now!')).toBe(true);
    });
    it('allows normal messages', () => {
        expect(isSuspiciousMessage('Transfer 10 EDU to my wallet')).toBe(false);
    });
    it('validateSigningMessage returns safe for normal', () => {
        expect(validateSigningMessage('Signing test').safe).toBe(true);
    });
    it('validateSigningMessage fails for long message', () => {
        expect(validateSigningMessage('a'.repeat(1001)).safe).toBe(false);
    });
});

describe('Address Blacklist', () => {
    const addr = 'EDUblacklist123';
    it('blacklistAddress and isBlacklisted work', () => {
        blacklistAddress(addr);
        expect(isBlacklisted(addr)).toBe(true);
    });
    it('whitelistAddress and isWhitelisted work', () => {
        whitelistAddress('EDUwhitelist456');
        expect(isWhitelisted('EDUwhitelist456')).toBe(true);
    });
});

describe('Clipboard Security', () => {
    it('validateAddressChange detects hijacking', () => {
        expect(validateAddressChange('EDUoriginal', 'EDUhijacked')).toBe(false);
    });
    it('validateAddressChange allows same address', () => {
        expect(validateAddressChange('EDUsame', 'EDUsame')).toBe(true);
    });
});

describe('Seed Phrase Detection', () => {
    it('detects potential seed phrase', () => {
        const phrase = 'word '.repeat(12).trim();
        expect(containsSeedPhrase(phrase)).toBe(true);
    });
    it('allows normal text', () => {
        expect(containsSeedPhrase('Hello world this is normal text')).toBe(false);
    });
});

describe('Phishing URL Detection', () => {
    it('detects known phishing', () => {
        expect(detectPhishingUrl('https://metamask-wallet.io').safe).toBe(false);
    });
    it('allows valid URL', () => {
        expect(detectPhishingUrl('https://example.com').safe).toBe(true);
    });
    it('fails invalid URL', () => {
        expect(detectPhishingUrl('not-a-url').safe).toBe(false);
    });
});
