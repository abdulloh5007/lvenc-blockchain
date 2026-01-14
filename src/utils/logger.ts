type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
};

const levelColors: Record<LogLevel, string> = {
    debug: colors.dim,
    info: colors.green,
    warn: colors.yellow,
    error: colors.red,
};

const levelIcons: Record<LogLevel, string> = {
    debug: '🔍',
    info: '✅',
    warn: '⚠️',
    error: '❌',
};

class Logger {
    private context: string;

    constructor(context: string = 'App') {
        this.context = context;
    }

    private log(level: LogLevel, message: string, ...args: unknown[]): void {
        const timestamp = new Date().toISOString();
        const color = levelColors[level];
        const icon = levelIcons[level];

        console.log(
            `${colors.dim}${timestamp}${colors.reset} ${icon} ${color}[${level.toUpperCase()}]${colors.reset} ${colors.cyan}[${this.context}]${colors.reset} ${message}`,
            ...args
        );
    }

    debug(message: string, ...args: unknown[]): void {
        this.log('debug', message, ...args);
    }

    info(message: string, ...args: unknown[]): void {
        this.log('info', message, ...args);
    }

    warn(message: string, ...args: unknown[]): void {
        this.log('warn', message, ...args);
    }

    error(message: string, ...args: unknown[]): void {
        this.log('error', message, ...args);
    }

    child(context: string): Logger {
        return new Logger(`${this.context}:${context}`);
    }
}

export const logger = new Logger('Blockchain');
export { Logger };
