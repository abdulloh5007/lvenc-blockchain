import { logger } from '../utils/logger.js';

const metadataLocks = new Set<string>();
const approvals = new Map<string, Map<string, { amount: number; expires: number }>>();
const royalties = new Map<string, { recipient: string; percentage: number }>();

const MAX_APPROVAL = 100;
const APPROVAL_EXPIRY = 24 * 60 * 60 * 1000;
const MIN_ROYALTY = 0;
const MAX_ROYALTY = 25;

export function lockMetadata(nftId: string): void {
    metadataLocks.add(nftId);
    logger.info(`🔒 Metadata locked: ${nftId}`);
}

export function isMetadataLocked(nftId: string): boolean {
    return metadataLocks.has(nftId);
}

export function checkMetadataUpdate(nftId: string): boolean {
    if (isMetadataLocked(nftId)) {
        logger.warn(`🚨 Metadata swap blocked: ${nftId}`);
        return false;
    }
    return true;
}

export function setApproval(owner: string, spender: string, amount: number): boolean {
    if (amount > MAX_APPROVAL) {
        logger.warn(`🚨 Infinite approval blocked: ${owner} → ${spender} (${amount})`);
        return false;
    }
    const ownerApprovals = approvals.get(owner) || new Map();
    ownerApprovals.set(spender, { amount, expires: Date.now() + APPROVAL_EXPIRY });
    approvals.set(owner, ownerApprovals);
    return true;
}

export function getApproval(owner: string, spender: string): number {
    const approval = approvals.get(owner)?.get(spender);
    if (!approval || Date.now() > approval.expires) return 0;
    return approval.amount;
}

export function useApproval(owner: string, spender: string, amount: number): boolean {
    const current = getApproval(owner, spender);
    if (current < amount) return false;
    const ownerApprovals = approvals.get(owner)!;
    const approval = ownerApprovals.get(spender)!;
    approval.amount -= amount;
    if (approval.amount <= 0) ownerApprovals.delete(spender);
    return true;
}

export function revokeApproval(owner: string, spender: string): void {
    approvals.get(owner)?.delete(spender);
}

export function revokeAllApprovals(owner: string): void {
    approvals.delete(owner);
}

export function setRoyalty(collectionId: string, recipient: string, percentage: number): boolean {
    if (percentage < MIN_ROYALTY || percentage > MAX_ROYALTY) {
        logger.warn(`🚨 Invalid royalty: ${percentage}%`);
        return false;
    }
    royalties.set(collectionId, { recipient, percentage });
    return true;
}

export function getRoyalty(collectionId: string): { recipient: string; percentage: number } | null {
    return royalties.get(collectionId) || null;
}

export function calculateRoyalty(collectionId: string, salePrice: number): { to: string; amount: number } | null {
    const royalty = getRoyalty(collectionId);
    if (!royalty) return null;
    return { to: royalty.recipient, amount: (salePrice * royalty.percentage) / 100 };
}

export function enforceRoyalty(collectionId: string, salePrice: number, paidRoyalty: number): boolean {
    const expected = calculateRoyalty(collectionId, salePrice);
    if (!expected) return true;
    if (paidRoyalty < expected.amount) {
        logger.warn(`🚨 Royalty bypass attempt: paid ${paidRoyalty}, expected ${expected.amount}`);
        return false;
    }
    return true;
}

const MIN_NFT_AMOUNT = 0.001;

export function isDustingAttack(amount: number): boolean {
    return amount > 0 && amount < MIN_NFT_AMOUNT;
}

export function filterDustTransactions<T extends { amount: number }>(txs: T[]): T[] {
    return txs.filter(tx => !isDustingAttack(tx.amount));
}

setInterval(() => {
    const now = Date.now();
    for (const [owner, spenders] of approvals) {
        for (const [spender, approval] of spenders) {
            if (now > approval.expires) spenders.delete(spender);
        }
        if (spenders.size === 0) approvals.delete(owner);
    }
}, 60000);
