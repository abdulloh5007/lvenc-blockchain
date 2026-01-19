/**
 * Peer Challenge
 * PoW-based anti-Sybil protection for P2P connections
 * Requires peers to solve a computational puzzle before being accepted
 */

import { sha256 } from '../../utils/crypto.js';
import { logger } from '../../utils/logger.js';

// Challenge difficulty: hash must start with this many zero bits
const CHALLENGE_DIFFICULTY = 16; // ~65k iterations average
const CHALLENGE_EXPIRY_MS = 30000; // 30 seconds to solve

interface Challenge {
    nonce: string;
    timestamp: number;
    difficulty: number;
}

interface ChallengeResponse {
    nonce: string;
    solution: string;
}

export class PeerChallenge {
    private pendingChallenges: Map<string, Challenge> = new Map();
    private log = logger.child('PeerChallenge');

    /**
     * Generate a challenge for a new peer
     */
    createChallenge(peerId: string): Challenge {
        const challenge: Challenge = {
            nonce: sha256(peerId + Date.now().toString() + Math.random().toString()),
            timestamp: Date.now(),
            difficulty: CHALLENGE_DIFFICULTY,
        };

        this.pendingChallenges.set(peerId, challenge);
        this.log.debug(`🧩 Created challenge for peer ${peerId.slice(0, 12)}...`);

        return challenge;
    }

    /**
     * Verify a challenge solution
     * Solution must produce hash with required leading zero bits
     */
    verifyChallenge(peerId: string, response: ChallengeResponse): boolean {
        const challenge = this.pendingChallenges.get(peerId);

        if (!challenge) {
            this.log.warn(`❌ No pending challenge for peer ${peerId.slice(0, 12)}...`);
            return false;
        }

        // Check expiry
        if (Date.now() - challenge.timestamp > CHALLENGE_EXPIRY_MS) {
            this.pendingChallenges.delete(peerId);
            this.log.warn(`⏰ Challenge expired for peer ${peerId.slice(0, 12)}...`);
            return false;
        }

        // Verify nonce matches
        if (response.nonce !== challenge.nonce) {
            this.log.warn(`❌ Invalid nonce from peer ${peerId.slice(0, 12)}...`);
            return false;
        }

        // Verify PoW solution
        const hash = sha256(challenge.nonce + response.solution);
        const leadingZeros = this.countLeadingZeroBits(hash);

        if (leadingZeros < challenge.difficulty) {
            this.log.warn(`❌ Invalid PoW from peer ${peerId.slice(0, 12)}... (${leadingZeros}/${challenge.difficulty} bits)`);
            return false;
        }

        // Valid solution
        this.pendingChallenges.delete(peerId);
        this.log.info(`✅ Challenge verified for peer ${peerId.slice(0, 12)}...`);
        return true;
    }

    /**
     * Solve a challenge (for connecting to other nodes)
     */
    static solveChallenge(challenge: Challenge): ChallengeResponse {
        let solution = 0;
        let hash: string;

        do {
            solution++;
            hash = sha256(challenge.nonce + solution.toString());
        } while (PeerChallenge.countLeadingZeroBitsStatic(hash) < challenge.difficulty);

        return {
            nonce: challenge.nonce,
            solution: solution.toString(),
        };
    }

    /**
     * Count leading zero bits in hex hash
     */
    private countLeadingZeroBits(hexHash: string): number {
        return PeerChallenge.countLeadingZeroBitsStatic(hexHash);
    }

    static countLeadingZeroBitsStatic(hexHash: string): number {
        let bits = 0;
        for (const char of hexHash) {
            const nibble = parseInt(char, 16);
            if (nibble === 0) {
                bits += 4;
            } else {
                // Count leading zeros in this nibble
                if (nibble < 8) bits++;
                if (nibble < 4) bits++;
                if (nibble < 2) bits++;
                break;
            }
        }
        return bits;
    }

    /**
     * Cleanup expired challenges
     */
    cleanupExpired(): void {
        const now = Date.now();
        for (const [peerId, challenge] of this.pendingChallenges) {
            if (now - challenge.timestamp > CHALLENGE_EXPIRY_MS) {
                this.pendingChallenges.delete(peerId);
            }
        }
    }
}

export const peerChallenge = new PeerChallenge();
