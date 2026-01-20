import { logger } from '../utils/logger.js';

interface RpcMethodLimit {
    window: number;
    max: number;
}

const RPC_LIMITS: Record<string, RpcMethodLimit> = {
    'eth_sendTransaction': { window: 60000, max: 20 },
    'eth_call': { window: 60000, max: 100 },
    'eth_getBalance': { window: 60000, max: 200 },
    'eth_getLogs': { window: 60000, max: 10 },
    'eth_subscribe': { window: 60000, max: 5 },
    'default': { window: 60000, max: 100 }
};

const rpcCounts = new Map<string, Map<string, { count: number; reset: number }>>();
const apiKeyUsage = new Map<string, { requests: number; lastUsed: number }>();
const nodeHealth = new Map<string, { healthy: boolean; lastCheck: number; failures: number }>();

export function checkRpcLimit(ip: string, method: string): boolean {
    const limit = RPC_LIMITS[method] || RPC_LIMITS['default'];
    const now = Date.now();
    let ipMethods = rpcCounts.get(ip);
    if (!ipMethods) {
        ipMethods = new Map();
        rpcCounts.set(ip, ipMethods);
    }
    let methodCount = ipMethods.get(method);
    if (!methodCount || now > methodCount.reset) {
        methodCount = { count: 0, reset: now + limit.window };
        ipMethods.set(method, methodCount);
    }
    methodCount.count++;
    if (methodCount.count > limit.max) {
        logger.warn(`🚨 RPC limit: ${method} from ${ip}`);
        return false;
    }
    return true;
}

export function trackApiKey(key: string): void {
    const usage = apiKeyUsage.get(key) || { requests: 0, lastUsed: 0 };
    usage.requests++;
    usage.lastUsed = Date.now();
    apiKeyUsage.set(key, usage);
}

export function getApiKeyStats(key: string): { requests: number; lastUsed: number } | null {
    return apiKeyUsage.get(key) || null;
}

export function isApiKeyAbused(key: string, maxRequestsPerHour: number = 10000): boolean {
    const usage = apiKeyUsage.get(key);
    if (!usage) return false;
    return usage.requests > maxRequestsPerHour;
}

export function rotateApiKey(oldKey: string): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const newKey = Array.from({ length: 64 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    apiKeyUsage.delete(oldKey);
    logger.info(`🔑 API key rotated`);
    return newKey;
}

export function initNode(nodeId: string): void {
    nodeHealth.set(nodeId, { healthy: true, lastCheck: Date.now(), failures: 0 });
}

export function reportNodeStatus(nodeId: string, healthy: boolean): void {
    const node = nodeHealth.get(nodeId);
    if (!node) return;
    node.lastCheck = Date.now();
    if (healthy) {
        node.healthy = true;
        node.failures = 0;
    } else {
        node.failures++;
        if (node.failures >= 3) {
            node.healthy = false;
            logger.warn(`🚨 Node unhealthy: ${nodeId}`);
        }
    }
}

export function isNodeHealthy(nodeId: string): boolean {
    return nodeHealth.get(nodeId)?.healthy ?? false;
}

export function getHealthyNodes(): string[] {
    return Array.from(nodeHealth.entries())
        .filter(([, n]) => n.healthy)
        .map(([id]) => id);
}

const ENV_SECRETS = ['PRIVATE_KEY', 'MNEMONIC', 'SECRET', 'PASSWORD', 'API_KEY', 'JWT', 'TOKEN'];

export function sanitizeEnvForLogs(env: Record<string, string | undefined>): Record<string, string> {
    const sanitized: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
        if (ENV_SECRETS.some(s => key.toUpperCase().includes(s))) {
            sanitized[key] = '[REDACTED]';
        } else if (value) {
            sanitized[key] = value;
        }
    }
    return sanitized;
}

export function detectKeyLeakage(text: string): boolean {
    const patterns = [
        /0x[a-fA-F0-9]{64}/g,
        /[a-zA-Z0-9]{40,}/g,
        /-----BEGIN.*PRIVATE.*-----/i
    ];
    for (const p of patterns) {
        if (p.test(text)) {
            logger.warn('🚨 Potential key leakage detected');
            return true;
        }
    }
    return false;
}

export function validateOrigin(origin: string, allowedOrigins: string[]): boolean {
    if (allowedOrigins.includes('*')) return true;
    return allowedOrigins.some(allowed => {
        if (allowed.startsWith('*.')) {
            return origin.endsWith(allowed.slice(1));
        }
        return origin === allowed;
    });
}

setInterval(() => {
    const now = Date.now();
    for (const [ip, methods] of rpcCounts) {
        for (const [method, count] of methods) {
            if (now > count.reset) methods.delete(method);
        }
        if (methods.size === 0) rpcCounts.delete(ip);
    }
    for (const [key, usage] of apiKeyUsage) {
        if (now - usage.lastUsed > 24 * 60 * 60 * 1000) {
            usage.requests = 0;
        }
    }
}, 5 * 60 * 1000);
