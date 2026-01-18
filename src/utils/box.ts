/**
 * Box Formatting Utility
 * Creates properly formatted CLI boxes with correct spacing
 */

const BOX_WIDTH = 59; // Inner width (between ║ symbols)

/**
 * Create a padded line for box output
 * @param content The text content
 * @param width Box inner width (default: 59)
 * @returns Formatted line with ║ borders and proper padding
 */
export function boxLine(content: string, width: number = BOX_WIDTH): string {
    // Account for emoji width (some emojis take 2 character spaces)
    const emojiCount = (content.match(/[\u{1F300}-\u{1F9FF}]|[\u2600-\u26FF]/gu) || []).length;
    const visibleLength = content.length + emojiCount;
    const padding = width - visibleLength;

    if (padding < 0) {
        // Truncate if too long
        return `║  ${content.substring(0, width - 3)}... ║`;
    }

    return `║  ${content}${' '.repeat(padding - 2)} ║`;
}

/**
 * Create a centered line for box output
 */
export function boxCenter(content: string, width: number = BOX_WIDTH): string {
    const emojiCount = (content.match(/[\u{1F300}-\u{1F9FF}]|[\u2600-\u26FF]/gu) || []).length;
    const visibleLength = content.length + emojiCount;
    const totalPadding = width - visibleLength;
    const leftPad = Math.floor(totalPadding / 2);
    const rightPad = totalPadding - leftPad;

    return `║${' '.repeat(leftPad)}${content}${' '.repeat(rightPad)}║`;
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
 * Create a complete box with multiple lines
 */
export function box(lines: string[], width: number = BOX_WIDTH): string[] {
    return [
        boxTop(width),
        ...lines.map(line => boxLine(line, width)),
        boxBottom(width),
    ];
}

/**
 * Print a box directly to console
 */
export function printBox(lines: string[], width: number = BOX_WIDTH): void {
    console.log(box(lines, width).join('\n'));
}
