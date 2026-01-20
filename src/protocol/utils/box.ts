/**
 * Box Formatting Utility
 * Creates properly formatted CLI boxes with CENTERED content
 */

export const BOX_WIDTH = 59; // Default inner width (between ║ symbols)

/**
 * Calculate optimal box width based on content
 * Adds 4 chars padding (2 on each side)
 */
export function autoWidth(lines: string[], minWidth: number = BOX_WIDTH): number {
    let maxLen = minWidth;
    for (const line of lines) {
        const len = getVisibleLength(line) + 4; // +4 for padding
        if (len > maxLen) maxLen = len;
    }
    return maxLen;
}

/**
 * Get visible length of text (accounting for emojis and ANSI codes)
 */
function getVisibleLength(text: string): number {
    // Remove ANSI color codes
    const noAnsi = text.replace(/\u001b\[[0-9;]*m/g, '');

    // Count emoji as 2 chars (they take 2 terminal columns)
    const emojiCount = (noAnsi.match(/[\u{1F300}-\u{1F9FF}]|[\u2600-\u26FF]/gu) || []).length;

    return noAnsi.length + emojiCount;
}

/**
 * Create a CENTERED line for box output
 */
export function boxCenter(content: string, width: number = BOX_WIDTH): string {
    const visibleLength = getVisibleLength(content);
    const totalPadding = width - visibleLength;

    if (totalPadding < 0) {
        // Truncate if too long
        return `║${content.substring(0, width)}║`;
    }

    const leftPad = Math.floor(totalPadding / 2);
    const rightPad = totalPadding - leftPad;

    return `║${' '.repeat(leftPad)}${content}${' '.repeat(rightPad)}║`;
}

/**
 * Create a LEFT-ALIGNED line for box output
 */
export function boxLine(content: string, width: number = BOX_WIDTH): string {
    const visibleLength = getVisibleLength(content);
    const padding = width - visibleLength;

    if (padding < 0) {
        return `║${content.substring(0, width)}║`;
    }

    return `║${content}${' '.repeat(padding)}║`;
}

/**
 * Create top border
 */
export function boxTop(width: number = BOX_WIDTH): string {
    return `╔${'═'.repeat(width)}╗`;
}

/**
 * Create bottom border
 */
export function boxBottom(width: number = BOX_WIDTH): string {
    return `╚${'═'.repeat(width)}╝`;
}

/**
 * Create separator
 */
export function boxSeparator(width: number = BOX_WIDTH): string {
    return `╠${'═'.repeat(width)}╣`;
}

/**
 * Create empty line
 */
export function boxEmpty(width: number = BOX_WIDTH): string {
    return `║${' '.repeat(width)}║`;
}

/**
 * Create a complete box with multiple lines (centered)
 */
export function box(lines: string[], width: number = BOX_WIDTH): string[] {
    return [
        boxTop(width),
        ...lines.map(line => boxCenter(line, width)),
        boxBottom(width),
    ];
}

/**
 * Print a box directly to console
 */
export function printBox(lines: string[], width: number = BOX_WIDTH): void {
    console.log(box(lines, width).join('\n'));
}
