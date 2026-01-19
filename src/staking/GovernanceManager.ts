/**
 * Governance Manager
 * On-chain voting system for LVE token holders
 * 
 * Features:
 * - Create proposals
 * - Vote with stake weight
 * - Execute passed proposals
 * - Quorum and threshold requirements
 */

import { stakingPool } from '../staking/StakingPool.js';
import { logger } from '../utils/logger.js';
import { sha256 } from '../utils/crypto.js';

// Governance parameters
const MIN_PROPOSAL_STAKE = 1000;    // Need 1000 LVE staked to create proposal
const VOTING_PERIOD_BLOCKS = 1000;  // ~8 hours at 30s blocks
const QUORUM_PERCENT = 10;          // 10% of total stake must vote
const PASS_THRESHOLD = 51;          // 51% of votes must be YES

type ProposalStatus = 'active' | 'passed' | 'rejected' | 'executed' | 'expired';
type VoteChoice = 'yes' | 'no' | 'abstain';

interface Vote {
    voter: string;
    choice: VoteChoice;
    weight: number;
    timestamp: number;
}

interface Proposal {
    id: string;
    title: string;
    description: string;
    proposer: string;
    createdBlock: number;
    endBlock: number;
    status: ProposalStatus;
    votes: Map<string, Vote>;
    yesWeight: number;
    noWeight: number;
    abstainWeight: number;
    totalVotes: number;
}

interface ProposalResult {
    id: string;
    title: string;
    status: ProposalStatus;
    yesPercent: number;
    noPercent: number;
    quorumReached: boolean;
    passed: boolean;
}

export class GovernanceManager {
    private proposals: Map<string, Proposal> = new Map();
    private log = logger.child('Governance');

    /**
     * Create a new proposal
     */
    createProposal(
        proposer: string,
        title: string,
        description: string,
        currentBlock: number
    ): Proposal {
        // Check proposer has enough stake
        const stake = stakingPool.getStake(proposer);
        if (stake < MIN_PROPOSAL_STAKE) {
            throw new Error(`Need ${MIN_PROPOSAL_STAKE} LVE staked to create proposal (have ${stake})`);
        }

        const id = sha256(proposer + title + currentBlock.toString()).slice(0, 16);

        const proposal: Proposal = {
            id,
            title,
            description,
            proposer,
            createdBlock: currentBlock,
            endBlock: currentBlock + VOTING_PERIOD_BLOCKS,
            status: 'active',
            votes: new Map(),
            yesWeight: 0,
            noWeight: 0,
            abstainWeight: 0,
            totalVotes: 0,
        };

        this.proposals.set(id, proposal);
        this.log.info(`📋 Proposal created: "${title}" by ${proposer.slice(0, 12)}...`);

        return proposal;
    }

    /**
     * Cast a vote on a proposal
     */
    vote(proposalId: string, voter: string, choice: VoteChoice, currentBlock: number): boolean {
        const proposal = this.proposals.get(proposalId);

        if (!proposal) {
            throw new Error('Proposal not found');
        }

        if (proposal.status !== 'active') {
            throw new Error(`Proposal is ${proposal.status}`);
        }

        if (currentBlock > proposal.endBlock) {
            throw new Error('Voting period ended');
        }

        // Check if already voted
        if (proposal.votes.has(voter)) {
            throw new Error('Already voted');
        }

        // Get vote weight from stake
        const weight = stakingPool.getStake(voter);
        if (weight <= 0) {
            throw new Error('Must stake LVE to vote');
        }

        const vote: Vote = {
            voter,
            choice,
            weight,
            timestamp: Date.now(),
        };

        proposal.votes.set(voter, vote);
        proposal.totalVotes++;

        // Update weights
        if (choice === 'yes') proposal.yesWeight += weight;
        else if (choice === 'no') proposal.noWeight += weight;
        else proposal.abstainWeight += weight;

        this.log.info(`🗳️ Vote cast: ${voter.slice(0, 12)}... voted ${choice} (${weight} LVE)`);
        return true;
    }

    /**
     * Finalize a proposal after voting period
     */
    finalizeProposal(proposalId: string, currentBlock: number): ProposalResult {
        const proposal = this.proposals.get(proposalId);

        if (!proposal) {
            throw new Error('Proposal not found');
        }

        if (currentBlock < proposal.endBlock) {
            throw new Error('Voting period not ended');
        }

        if (proposal.status !== 'active') {
            return this.getProposalResult(proposal);
        }

        // Calculate results
        const totalStake = stakingPool.getTotalStaked() + stakingPool.getTotalDelegated();
        const totalVoteWeight = proposal.yesWeight + proposal.noWeight + proposal.abstainWeight;
        const quorumReached = (totalVoteWeight / totalStake) * 100 >= QUORUM_PERCENT;

        const effectiveVotes = proposal.yesWeight + proposal.noWeight;
        const yesPercent = effectiveVotes > 0 ? (proposal.yesWeight / effectiveVotes) * 100 : 0;

        const passed = quorumReached && yesPercent >= PASS_THRESHOLD;

        proposal.status = passed ? 'passed' : 'rejected';

        this.log.info(`📊 Proposal "${proposal.title}" ${proposal.status}: ${yesPercent.toFixed(1)}% yes, quorum: ${quorumReached}`);

        return this.getProposalResult(proposal);
    }

    /**
     * Get proposal result
     */
    private getProposalResult(proposal: Proposal): ProposalResult {
        const totalStake = stakingPool.getTotalStaked() + stakingPool.getTotalDelegated();
        const totalVoteWeight = proposal.yesWeight + proposal.noWeight + proposal.abstainWeight;
        const effectiveVotes = proposal.yesWeight + proposal.noWeight;

        return {
            id: proposal.id,
            title: proposal.title,
            status: proposal.status,
            yesPercent: effectiveVotes > 0 ? (proposal.yesWeight / effectiveVotes) * 100 : 0,
            noPercent: effectiveVotes > 0 ? (proposal.noWeight / effectiveVotes) * 100 : 0,
            quorumReached: totalStake > 0 ? (totalVoteWeight / totalStake) * 100 >= QUORUM_PERCENT : false,
            passed: proposal.status === 'passed',
        };
    }

    /**
     * Get active proposals
     */
    getActiveProposals(): Proposal[] {
        return Array.from(this.proposals.values()).filter(p => p.status === 'active');
    }

    /**
     * Get all proposals
     */
    getAllProposals(): Proposal[] {
        return Array.from(this.proposals.values());
    }

    /**
     * Get proposal by ID
     */
    getProposal(id: string): Proposal | undefined {
        return this.proposals.get(id);
    }
}

export const governanceManager = new GovernanceManager();

// Export constants
export const GOVERNANCE_PARAMS = {
    MIN_PROPOSAL_STAKE,
    VOTING_PERIOD_BLOCKS,
    QUORUM_PERCENT,
    PASS_THRESHOLD,
};
