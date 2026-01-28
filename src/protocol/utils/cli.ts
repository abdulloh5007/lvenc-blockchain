/**
 * CLI Formatting Utility
 * 
 * Professional CLI output using chalk, boxen, and figures.
 * Provides beautiful formatted output with automatic fallback
 * for terminals that don't support Unicode/emojis.
 */

import chalk from 'chalk';
import boxen, { Options as BoxenOptions } from 'boxen';
import figures from 'figures';
import logSymbols from 'log-symbols';

// ==================== SYMBOLS ====================
// figures provides automatic fallback for terminals without Unicode

export const sym = {
    // Status (with automatic fallback)
    success: logSymbols.success,  // ✔ or √
    error: logSymbols.error,      // ✖ or ×
    warning: logSymbols.warning,  // ⚠ or ‼
    info: logSymbols.info,        // ℹ or i

    // Arrows and pointers
    arrow: figures.arrowRight,    // → or >
    pointer: figures.pointer,     // ❯ or >

    // Bullets
    bullet: figures.bullet,       // ● or *
    star: figures.star,           // ★ or *

    // Misc
    tick: figures.tick,           // ✔ or √
    cross: figures.cross,         // ✖ or ×
    heart: figures.heart,         // ❤ or ♥
    play: figures.play,           // ▶ or >

    // Custom emojis (these may not have fallback)
    rocket: '🚀',
    key: '🔐',
    money: '💰',
    lightning: '⚡',
    gem: '💎',
    fire: '🔥',
    sparkles: '✨',
    chain: '🔗',
    lock: '🔒',
    unlock: '🔓',
    package: '📦',
    file: '📄',
    folder: '📁',
    gear: '⚙️',
    wrench: '🔧',
    hammer: '🔨',
    shield: '🛡️',
    globe: '🌐',
    clock: '⏰',
    check: '✅',
    x: '❌',
    warning_emoji: '⚠️',
    bulb: '💡',
    pin: '📌',
};

// ==================== COLORS ====================

export const c = {
    // Basic colors
    primary: chalk.cyan,
    secondary: chalk.gray,
    success: chalk.green,
    error: chalk.red,
    warning: chalk.yellow,
    info: chalk.blue,

    // Text styles
    bold: chalk.bold,
    dim: chalk.dim,
    italic: chalk.italic,
    underline: chalk.underline,

    // Semantic
    heading: chalk.bold.cyan,
    subheading: chalk.bold.white,
    label: chalk.gray,
    value: chalk.white,
    highlight: chalk.bold.yellow,
    muted: chalk.dim,
    link: chalk.underline.blue,

    // Status
    ok: chalk.green,
    err: chalk.red,
    warn: chalk.yellow,
};

// ==================== BOX STYLES ====================

const defaultBoxStyle: BoxenOptions = {
    padding: 1,
    borderStyle: 'round',
    borderColor: 'cyan',
};

/**
 * Create a beautiful box with title
 */
export function box(content: string, title?: string, options?: BoxenOptions): string {
    return boxen(content, {
        ...defaultBoxStyle,
        title,
        titleAlignment: 'center',
        ...options,
    });
}

/**
 * Success box
 */
export function successBox(content: string, title?: string): string {
    return boxen(content, {
        ...defaultBoxStyle,
        borderColor: 'green',
        title: title || `${sym.success} Success`,
        titleAlignment: 'center',
    });
}

/**
 * Error box
 */
export function errorBox(content: string, title?: string): string {
    return boxen(content, {
        ...defaultBoxStyle,
        borderColor: 'red',
        title: title || `${sym.error} Error`,
        titleAlignment: 'center',
    });
}

/**
 * Warning box
 */
export function warningBox(content: string, title?: string): string {
    return boxen(content, {
        ...defaultBoxStyle,
        borderColor: 'yellow',
        title: title || `${sym.warning} Warning`,
        titleAlignment: 'center',
    });
}

/**
 * Info box
 */
export function infoBox(content: string, title?: string): string {
    return boxen(content, {
        ...defaultBoxStyle,
        borderColor: 'blue',
        title: title || `${sym.info} Info`,
        titleAlignment: 'center',
    });
}

// ==================== HEADER ====================

/**
 * Print LVE Chain header
 */
export function header(title: string, emoji: string = sym.chain): string {
    const text = c.heading(`${emoji} LVE Chain · ${title}`);
    return boxen(text, {
        padding: { top: 0, bottom: 0, left: 2, right: 2 },
        borderStyle: 'round',
        borderColor: 'cyan',
    });
}

// ==================== MESSAGES ====================

/**
 * Success message
 */
export function success(msg: string): void {
    console.log(`${sym.success} ${c.success(msg)}`);
}

/**
 * Error message
 */
export function error(msg: string): void {
    console.log(`${sym.error} ${c.error(msg)}`);
}

/**
 * Warning message
 */
export function warn(msg: string): void {
    console.log(`${sym.warning} ${c.warning(msg)}`);
}

/**
 * Info message
 */
export function info(msg: string): void {
    console.log(`${sym.info} ${c.info(msg)}`);
}

/**
 * Step message (for multi-step processes)
 */
export function step(current: number, total: number, msg: string, done: boolean = false): void {
    const icon = done ? sym.success : sym.pointer;
    const color = done ? c.success : c.info;
    console.log(`${icon} ${c.dim(`Step ${current}/${total}:`)} ${color(msg)}`);
}

/**
 * Key-value pair
 */
export function keyValue(key: string, value: string, indent: number = 0): void {
    const pad = ' '.repeat(indent);
    console.log(`${pad}${c.label(key + ':')} ${c.value(value)}`);
}

// ==================== DIVIDERS ====================

/**
 * Print a divider line
 */
export function divider(char: string = '─', length: number = 50): void {
    console.log(c.dim(char.repeat(length)));
}

/**
 * Print empty line
 */
export function newline(): void {
    console.log('');
}

// ==================== EXPORTS ====================

export default {
    sym,
    c,
    box,
    successBox,
    errorBox,
    warningBox,
    infoBox,
    header,
    success,
    error,
    warn,
    info,
    step,
    keyValue,
    divider,
    newline,
};
