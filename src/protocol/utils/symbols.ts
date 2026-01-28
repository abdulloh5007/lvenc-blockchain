/**
 * Unicode Symbols for CLI output
 * 
 * These symbols work in any UTF-8 terminal without special fonts.
 * Use these instead of emojis for cross-platform compatibility.
 */

export const SYM = {
    // Status
    OK: '✓',        // Checkmark (success)
    ERR: '✗',       // X mark (error)
    WARN: '⚠',      // Warning triangle
    INFO: '●',      // Bullet (info)

    // Actions
    ARROW: '➜',     // Arrow (next step)
    PLUS: '+',      // Plus (add)
    MINUS: '-',     // Minus (remove)

    // Objects
    KEY: '◆',       // Diamond (key/secure)
    STAR: '★',      // Star
    DOT: '·',       // Middle dot (separator)
    BLOCK: '█',     // Block

    // Progress
    SPINNER: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
} as const;

/**
 * Format a success message
 */
export function fmtOk(msg: string): string {
    return `${SYM.OK} ${msg}`;
}

/**
 * Format an error message
 */
export function fmtErr(msg: string): string {
    return `${SYM.ERR} ${msg}`;
}

/**
 * Format a warning message
 */
export function fmtWarn(msg: string): string {
    return `${SYM.WARN} ${msg}`;
}

/**
 * Format an info message
 */
export function fmtInfo(msg: string): string {
    return `${SYM.INFO} ${msg}`;
}
