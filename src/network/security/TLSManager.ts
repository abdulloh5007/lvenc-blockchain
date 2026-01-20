/**
 * TLS Configuration for P2P
 * Provides secure WebSocket connections with self-signed or CA certificates
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { logger } from '../../protocol/utils/logger.js';

const CERT_DIR = './data/certs';
const CERT_FILE = 'node.crt';
const KEY_FILE = 'node.key';
const CERT_VALIDITY_DAYS = 365;

interface TLSConfig {
    enabled: boolean;
    cert: string;
    key: string;
    rejectUnauthorized: boolean;
}

export class TLSManager {
    private certPath: string;
    private keyPath: string;
    private log = logger.child('TLS');

    constructor(dataDir: string = CERT_DIR) {
        this.certPath = path.join(dataDir, CERT_FILE);
        this.keyPath = path.join(dataDir, KEY_FILE);
    }

    /**
     * Check if TLS certificates exist
     */
    hasCertificates(): boolean {
        return fs.existsSync(this.certPath) && fs.existsSync(this.keyPath);
    }

    /**
     * Generate self-signed certificate for P2P communications
     */
    generateSelfSignedCert(): { cert: string; key: string } {
        this.log.info('🔐 Generating self-signed TLS certificate...');

        // Ensure directory exists
        const dir = path.dirname(this.certPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Generate key pair using Node.js crypto
        const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        });

        // Create a simple self-signed certificate
        // In production, use a proper CA or Let's Encrypt
        const cert = this.createSelfSignedCert(privateKey, publicKey);

        // Save to files with secure permissions
        fs.writeFileSync(this.keyPath, privateKey, { mode: 0o600 });
        fs.writeFileSync(this.certPath, cert, { mode: 0o644 });

        this.log.info(`✅ TLS certificate generated: ${this.certPath}`);
        return { cert, key: privateKey };
    }

    /**
     * Create a self-signed certificate (simplified)
     * For production, use openssl or a proper certificate library
     */
    private createSelfSignedCert(privateKey: string, publicKey: string): string {
        // This is a placeholder - in production use proper X.509 generation
        // For now, we return a marker that indicates self-signed
        const certData = {
            version: 3,
            serialNumber: crypto.randomBytes(16).toString('hex'),
            issuer: 'CN=LVENC Node,O=LVENC Network',
            subject: 'CN=LVENC Node,O=LVENC Network',
            notBefore: new Date().toISOString(),
            notAfter: new Date(Date.now() + CERT_VALIDITY_DAYS * 24 * 60 * 60 * 1000).toISOString(),
            publicKey: publicKey.slice(0, 100) + '...',
        };

        // Return PEM-formatted certificate placeholder
        const certBase64 = Buffer.from(JSON.stringify(certData)).toString('base64');
        return `-----BEGIN CERTIFICATE-----\n${certBase64}\n-----END CERTIFICATE-----`;
    }

    /**
     * Load existing certificates
     */
    loadCertificates(): { cert: string; key: string } | null {
        if (!this.hasCertificates()) {
            return null;
        }

        try {
            const cert = fs.readFileSync(this.certPath, 'utf-8');
            const key = fs.readFileSync(this.keyPath, 'utf-8');
            this.log.info('🔐 TLS certificates loaded');
            return { cert, key };
        } catch (error) {
            this.log.error('Failed to load TLS certificates:', error);
            return null;
        }
    }

    /**
     * Get TLS configuration for WebSocket server
     */
    getTLSConfig(forceGenerate: boolean = false): TLSConfig | null {
        let certs = this.loadCertificates();

        if (!certs) {
            if (forceGenerate) {
                certs = this.generateSelfSignedCert();
            } else {
                this.log.warn('⚠️ TLS disabled: no certificates found');
                return null;
            }
        }

        return {
            enabled: true,
            cert: certs.cert,
            key: certs.key,
            rejectUnauthorized: false, // Allow self-signed for P2P
        };
    }

    /**
     * Get paths for external certificate loading
     */
    getCertPaths(): { certPath: string; keyPath: string } {
        return {
            certPath: this.certPath,
            keyPath: this.keyPath,
        };
    }
}

export const tlsManager = new TLSManager();
