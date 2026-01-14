import { parentPort, workerData } from 'worker_threads';
import { sha256, hashMeetsDifficulty } from '../utils/crypto.js';

interface MineRequest {
    blockData: string;
    difficulty: number;
    startNonce: number;
}

interface MineResult {
    hash: string;
    nonce: number;
    time: number;
}

const { blockData, difficulty, startNonce } = workerData as MineRequest;

function mine(): MineResult {
    const startTime = Date.now();
    let nonce = startNonce;
    let hash = '';
    while (true) {
        hash = sha256(blockData + nonce.toString());
        if (hashMeetsDifficulty(hash, difficulty)) break;
        nonce++;
        if (nonce % 100000 === 0) {
            parentPort?.postMessage({ type: 'progress', nonce, hashRate: Math.floor(nonce / ((Date.now() - startTime) / 1000)) });
        }
    }
    return { hash, nonce, time: Date.now() - startTime };
}

const result = mine();
parentPort?.postMessage({ type: 'done', ...result });
