import { Worker } from 'worker_threads';
import { join } from 'path';
import { existsSync } from 'fs';
import { logger } from '../utils/logger.js';

function getWorkerPath(): string {
    const distPath = join(process.cwd(), 'dist', 'mining', 'miner-worker.js');
    if (existsSync(distPath)) return distPath;
    throw new Error(`Miner worker not found at ${distPath}. Run 'npm run build' first.`);
}

interface MiningJob {
    id: string;
    blockData: string;
    difficulty: number;
    resolve: (result: { hash: string; nonce: number }) => void;
    reject: (error: Error) => void;
    worker?: Worker;
}

export class MiningService {
    private activeJob: MiningJob | null = null;
    private log = logger.child('MiningService');

    async mine(blockData: string, difficulty: number): Promise<{ hash: string; nonce: number }> {
        if (this.activeJob) {
            throw new Error('Mining already in progress');
        }
        return new Promise((resolve, reject) => {
            const job: MiningJob = {
                id: Date.now().toString(),
                blockData,
                difficulty,
                resolve,
                reject,
            };
            this.activeJob = job;
            this.startWorker(job);
        });
    }

    private startWorker(job: MiningJob): void {
        const workerPath = getWorkerPath();
        this.log.debug(`Starting worker from: ${workerPath}`);
        const worker = new Worker(workerPath, {
            workerData: {
                blockData: job.blockData,
                difficulty: job.difficulty,
                startNonce: 0,
            },
        });
        job.worker = worker;
        worker.on('message', (msg) => {
            if (msg.type === 'progress') {
                this.log.debug(`Mining: nonce=${msg.nonce}, ${msg.hashRate} H/s`);
            } else if (msg.type === 'done') {
                this.log.info(`✨ Mined! Hash: ${msg.hash.slice(0, 16)}... Nonce: ${msg.nonce} Time: ${msg.time}ms`);
                this.activeJob = null;
                job.resolve({ hash: msg.hash, nonce: msg.nonce });
            }
        });
        worker.on('error', (err) => {
            this.log.error(`Mining worker error: ${err.message}`);
            this.activeJob = null;
            job.reject(err);
        });
        worker.on('exit', (code) => {
            if (code !== 0 && this.activeJob === job) {
                this.activeJob = null;
                job.reject(new Error(`Worker exited with code ${code}`));
            }
        });
    }

    cancelMining(): boolean {
        if (this.activeJob?.worker) {
            this.activeJob.worker.terminate();
            this.activeJob = null;
            this.log.info('Mining cancelled');
            return true;
        }
        return false;
    }

    isMining(): boolean {
        return this.activeJob !== null;
    }
}

export const miningService = new MiningService();
