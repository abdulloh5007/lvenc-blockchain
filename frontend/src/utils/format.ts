/**
 * Formatting utilities for currency display
 */

/**
 * Format balance with exactly 3 decimal places
 * Examples: 10.000, 10.023, 0.001
 */
export function formatBalance(balance: number): string {
    return balance.toFixed(3);
}

/**
 * Format balance with smart decimals (up to 3, but trim trailing zeros)
 * Examples: 10, 10.5, 10.023
 */
export function formatBalanceSmart(balance: number): string {
    const fixed = balance.toFixed(3);
    return parseFloat(fixed).toString();
}

/**
 * Format large numbers with K/M suffix
 * Examples: 1.5K, 2.3M
 */
export function formatLargeNumber(num: number): string {
    if (num >= 1_000_000) {
        return (num / 1_000_000).toFixed(2) + 'M';
    }
    if (num >= 1_000) {
        return (num / 1_000).toFixed(2) + 'K';
    }
    return num.toFixed(3);
}
