import { initNodeIdentity, getNodeIdentity } from './dist/node/identity/index.js';
import * as fs from 'fs';
import * as path from 'path';

async function generate() {
    console.log('🔑 Generating new identity...');

    // Ensure data directory exists
    const dataDir = './data/testnet';
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    const identity = await initNodeIdentity(dataDir);
    const pubKey = identity.getNodeId();

    console.log('\n✅ Identity Key Created Successfully!');
    console.log('path: ', path.join(dataDir, 'identity.key'));
    console.log('---------------------------------------------------');
    console.log('YOUR PUBLIC KEY (Node ID):');
    console.log(pubKey);
    console.log('---------------------------------------------------');
    console.log('👉 Copy this key into GENESIS_PUBLIC_KEY in ecosystem.config.cjs');
}

generate().catch(console.error);
