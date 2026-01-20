import { Router, Request, Response } from 'express';
import { Blockchain, Transaction } from '../../../protocol/blockchain/index.js';
import { stakingPool } from '../../../runtime/staking/index.js';
import { storage } from '../../../protocol/storage/index.js';
import { logger } from '../../../protocol/utils/logger.js';

export function createStakingRoutes(blockchain: Blockchain): Router {
    const router = Router();
    const log = logger.child('StakingAPI');

    // ========== EPOCH INFO ==========

    router.get('/epoch', (_req: Request, res: Response) => {
        const epochInfo = stakingPool.getEpochInfo();
        const latestBlock = blockchain.getLatestBlock();
        const blocksInEpoch = latestBlock.index - epochInfo.startBlock;
        const epochDuration = stakingPool.getEpochDuration();

        res.json({
            success: true,
            data: {
                currentEpoch: epochInfo.epoch,
                epochDuration,
                startBlock: epochInfo.startBlock,
                endBlock: epochInfo.endBlock,
                currentBlock: latestBlock.index,
                blocksRemaining: Math.max(0, epochDuration - blocksInEpoch),
                progress: Math.min(100, Math.round((blocksInEpoch / epochDuration) * 100)),
            },
        });
    });

    // ========== STAKING ==========

    router.post('/stake', (req: Request, res: Response) => {
        const { address, amount, signature, publicKey } = req.body;
        if (!address || !amount || amount <= 0) {
            res.status(400).json({ success: false, error: 'Address and positive amount required' });
            return;
        }

        const availableBalance = blockchain.getAvailableBalance(address);
        if (availableBalance < amount) {
            res.status(400).json({ success: false, error: `Insufficient available balance: ${availableBalance} < ${amount}` });
            return;
        }

        try {
            // Create STAKE transaction (on-chain staking)
            const tx = new Transaction(
                address,           // fromAddress
                'STAKE_POOL',      // toAddress (system address)
                amount,            // amount
                0,                 // fee
                Date.now(),        // timestamp
                undefined,         // id (auto-generated)
                undefined,         // nonce
                undefined,         // chainId
                'STAKE'            // type
            );

            // Set signature if provided
            if (signature) {
                tx.signature = signature;
            }

            // Add to pending transactions (will be included in next block)
            blockchain.addTransaction(tx);

            // Also apply immediately for local state (will be rebuilt from chain on sync)
            stakingPool.stake(address, amount);
            storage.saveStaking(stakingPool.toJSON());

            const epochInfo = stakingPool.getEpochInfo();
            log.info(`📊 STAKE tx: ${address.slice(0, 10)}... staked ${amount} LVE`);

            res.json({
                success: true,
                data: {
                    message: `Staked ${amount} LVE via on-chain transaction`,
                    txId: tx.id,
                    currentStake: stakingPool.getStake(address),
                    pendingStake: stakingPool.getPendingStake(address),
                    effectiveEpoch: epochInfo.epoch + 1,
                },
            });
        } catch (error) {
            res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Staking failed' });
        }
    });

    router.post('/unstake', (req: Request, res: Response) => {
        const { address, amount } = req.body;
        if (!address || !amount || amount <= 0) {
            res.status(400).json({ success: false, error: 'Address and positive amount required' });
            return;
        }
        const request = stakingPool.requestUnstake(address, amount);
        if (request) {
            storage.saveStaking(stakingPool.toJSON());
            res.json({
                success: true,
                data: {
                    message: `Unstake requested: ${amount} LVE (available after epoch ${request.epochEffective})`,
                    effectiveEpoch: request.epochEffective,
                    remainingStake: stakingPool.getStake(address),
                },
            });
        } else {
            res.status(400).json({ success: false, error: 'Insufficient staked amount' });
        }
    });

    router.post('/claim', (req: Request, res: Response) => {
        const { address } = req.body;
        if (!address) {
            res.status(400).json({ success: false, error: 'Address required' });
            return;
        }
        const released = stakingPool.completeUnstake(address);
        if (released > 0) {
            const tx = new Transaction(null, address, released, 0);
            blockchain.addTransaction(tx);
            storage.saveBlockchain(blockchain.toJSON());
            storage.saveStaking(stakingPool.toJSON());
            log.info(`💰 ${address.slice(0, 10)}... claimed ${released} LVE from unstake`);
            res.json({
                success: true,
                data: { message: `Claimed ${released} LVE`, amount: released, transactionId: tx.id },
            });
        } else {
            res.json({
                success: true,
                data: { message: 'No unstake requests ready', pendingRequests: stakingPool.getUnstakeRequests(address) },
            });
        }
    });

    // ========== DELEGATION ==========

    router.post('/delegate', (req: Request, res: Response) => {
        const { delegator, validator, amount } = req.body;
        if (!delegator || !validator || !amount || amount <= 0) {
            res.status(400).json({ success: false, error: 'delegator, validator, and positive amount required' });
            return;
        }
        const availableBalance = blockchain.getAvailableBalance(delegator);
        if (availableBalance < amount) {
            res.status(400).json({ success: false, error: `Insufficient balance: ${availableBalance} < ${amount}` });
            return;
        }
        try {
            const success = stakingPool.delegate(delegator, validator, amount);
            if (success) {
                storage.saveStaking(stakingPool.toJSON());
                const epochInfo = stakingPool.getEpochInfo();
                log.info(`📊 ${delegator.slice(0, 10)}... delegated ${amount} LVE to ${validator.slice(0, 10)}...`);
                res.json({
                    success: true,
                    data: {
                        message: `Delegated ${amount} LVE to validator (effective next epoch)`,
                        effectiveEpoch: epochInfo.epoch + 1,
                        delegations: stakingPool.getDelegations(delegator),
                    },
                });
            } else {
                res.status(400).json({ success: false, error: 'Delegation failed. Minimum is 10 LVE to active validator.' });
            }
        } catch (error) {
            res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Delegation failed' });
        }
    });

    router.post('/undelegate', (req: Request, res: Response) => {
        const { delegator, validator, amount } = req.body;
        if (!delegator || !validator || !amount || amount <= 0) {
            res.status(400).json({ success: false, error: 'delegator, validator, and positive amount required' });
            return;
        }
        try {
            const success = stakingPool.undelegate(delegator, validator, amount);
            if (success) {
                // Return undelegated funds to user
                const tx = new Transaction(null, delegator, amount, 0);
                blockchain.addTransaction(tx);
                storage.saveBlockchain(blockchain.toJSON());
                storage.saveStaking(stakingPool.toJSON());
                log.info(`🔓 ${delegator.slice(0, 10)}... undelegated ${amount} LVE from ${validator.slice(0, 10)}...`);
                res.json({
                    success: true,
                    data: {
                        message: `Undelegated ${amount} LVE`,
                        transactionId: tx.id,
                        remainingDelegations: stakingPool.getDelegations(delegator),
                    },
                });
            } else {
                res.status(400).json({ success: false, error: 'Insufficient delegated amount' });
            }
        } catch (error) {
            res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Undelegation failed' });
        }
    });

    router.get('/delegations/:address', (req: Request, res: Response) => {
        const { address } = req.params;
        const delegations = stakingPool.getDelegations(address);
        res.json({
            success: true,
            data: {
                address,
                delegations,
                totalDelegated: delegations.reduce((sum, d) => sum + d.amount, 0),
            },
        });
    });

    // ========== VALIDATORS ==========

    router.get('/validators', (_req: Request, res: Response) => {
        const validators = stakingPool.getValidators();
        res.json({
            success: true,
            data: {
                validators: validators.map(v => ({
                    ...v,
                    totalWeight: v.stake + v.delegatedStake,
                })),
                totalStaked: stakingPool.getTotalStaked(),
                totalDelegated: stakingPool.getTotalDelegated(),
                count: validators.length,
            },
        });
    });

    router.get('/validator/:address', (req: Request, res: Response) => {
        const { address } = req.params;
        const validators = stakingPool.getAllValidators();
        const validator = validators.find(v => v.address === address);
        if (!validator) {
            res.status(404).json({ success: false, error: 'Validator not found' });
            return;
        }
        const delegators = stakingPool.getValidatorDelegators(address);
        res.json({
            success: true,
            data: {
                validator: {
                    ...validator,
                    totalWeight: validator.stake + validator.delegatedStake,
                },
                delegators,
            },
        });
    });

    router.post('/commission', (req: Request, res: Response) => {
        const { address, commission } = req.body;
        if (!address || commission === undefined || commission < 0 || commission > 100) {
            res.status(400).json({ success: false, error: 'Valid address and commission (0-100) required' });
            return;
        }
        const success = stakingPool.setCommission(address, commission);
        if (success) {
            storage.saveStaking(stakingPool.toJSON());
            res.json({
                success: true,
                data: { message: `Commission set to ${commission}%` },
            });
        } else {
            res.status(400).json({ success: false, error: 'Failed to set commission. Are you a validator?' });
        }
    });

    // ========== USER INFO ==========

    router.get('/:address', (req: Request, res: Response) => {
        const { address } = req.params;
        const stake = stakingPool.getStake(address);
        const pendingStake = stakingPool.getPendingStake(address);
        const unstakeRequests = stakingPool.getUnstakeRequests(address);
        const delegations = stakingPool.getDelegations(address);
        const epochInfo = stakingPool.getEpochInfo();

        res.json({
            success: true,
            data: {
                address,
                stake,
                pendingStake,
                unstakeRequests,
                delegations,
                totalDelegated: delegations.reduce((sum, d) => sum + d.amount, 0),
                isValidator: stake >= 100,
                currentEpoch: epochInfo.epoch,
            },
        });
    });

    return router;
}
