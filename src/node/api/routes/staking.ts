import { Router, Request, Response } from 'express';
import { Blockchain, Transaction } from '../../../protocol/blockchain/index.js';
import { stakingPool } from '../../../runtime/staking/index.js';
import { slashingManager } from '../../../runtime/staking/SlashingManager.js';
import { storage } from '../../../protocol/storage/index.js';
import { logger } from '../../../protocol/utils/logger.js';
import { validateStakingTx } from '../middleware/tx-validation.js';
import { config } from '../../config.js';


export function createStakingRoutes(blockchain: Blockchain): Router {
    const router = Router();
    const log = logger.child('StakingAPI');

    // ========== SYNC CHECK MIDDLEWARE ==========
    // MULTI-LAYER SECURITY: Prevents stake operations before node is fully synced
    // Layer 1: isSynced flag check
    // Layer 2: Minimum block height check (prevents stuck sync attacks)
    const MIN_BLOCKS_REQUIRED = 10; // Require at least 10 blocks before accepting stake txs

    const requireSynced = (req: Request, res: Response, next: Function) => {
        // Layer 1: Check sync flag
        if (!blockchain.getIsSynced()) {
            log.warn(`⚠️ SECURITY: Blocking ${req.method} ${req.path} - node not synced`);
            res.status(503).json({
                success: false,
                error: 'Node is syncing. Please wait for synchronization to complete.',
                code: 'NODE_SYNCING',
                hint: 'Try again in a few seconds after sync completes.',
            });
            return;
        }

        // Layer 2: Check minimum block height (prevents empty chain attacks)
        const latestBlock = blockchain.getLatestBlock();
        if (latestBlock.index < MIN_BLOCKS_REQUIRED) {
            log.warn(`⚠️ SECURITY: Blocking ${req.method} ${req.path} - chain too short (${latestBlock.index} < ${MIN_BLOCKS_REQUIRED})`);
            res.status(503).json({
                success: false,
                error: `Chain not ready. Current height: ${latestBlock.index}, required: ${MIN_BLOCKS_REQUIRED}`,
                code: 'CHAIN_TOO_SHORT',
                hint: 'Wait for more blocks to be synced.',
            });
            return;
        }

        next();
    };

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

    /**
     * POST /stake - Relay a signed STAKE transaction to the mempool
     * 
     * Architecture note:
     * - Client signs the transaction with their private key (for blockchain validation)
     * - API/RPC node only RELAYS the signed tx to pending pool
     * - Pre-validation: structure, ed25519, nonce, chainId, duplicate, rate limit
     * - Signature and staking conditions are validated by blockchain runtime during block execution
     */
    router.post('/stake', requireSynced, validateStakingTx('STAKE'), (req: Request, res: Response) => {
        const { address, amount, signature, publicKey, nonce, chainId } = req.body;

        // Pre-check balance (optional optimization, final check is in runtime)
        const availableBalance = blockchain.getAvailableBalance(address);
        if (availableBalance < amount) {
            res.status(400).json({ success: false, error: `Insufficient available balance: ${availableBalance} < ${amount}` });
            return;
        }

        try {
            // Create STAKE transaction for relay
            // Canonical hash: sha256(chainId + txType + from + to + amount + fee + nonce)
            const tx = new Transaction(
                address,           // fromAddress (signer)
                'STAKE_POOL',      // toAddress (system address)
                amount,            // amount to stake
                0,                 // fee
                Date.now(),        // timestamp (metadata only)
                undefined,         // id (auto-generated)
                nonce,             // nonce (pre-validated by middleware)
                chainId,           // chainId (pre-validated by middleware)
                'STAKE',           // type
                undefined,         // data
                'ed25519',         // signatureScheme
                publicKey          // publicKey (pre-validated by middleware)
            );

            // Attach client signature (pre-verified by middleware)
            tx.signature = signature;

            // Relay to pending pool
            blockchain.addTransaction(tx);

            const epochInfo = stakingPool.getEpochInfo();
            log.info(`📊 STAKE tx submitted: ${address.slice(0, 10)}... ${amount} LVE (nonce: ${nonce})`);

            res.json({
                success: true,
                data: {
                    message: `STAKE transaction submitted. Will be applied when included in block.`,
                    txId: tx.id,
                    status: 'pending',
                    amount,
                    effectiveEpoch: epochInfo.epoch + 1,
                },
            });
        } catch (error) {
            res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Staking failed' });
        }
    });

    router.post('/unstake', requireSynced, validateStakingTx('UNSTAKE'), (req: Request, res: Response) => {
        const { address, amount, signature, publicKey, nonce, chainId } = req.body;

        try {
            // Create UNSTAKE transaction for relay
            const tx = new Transaction(
                address,           // fromAddress (signer)
                'STAKE_POOL',      // toAddress (system address)
                amount,            // amount to unstake
                0,                 // fee
                Date.now(),        // timestamp
                undefined,         // id
                nonce,             // nonce
                chainId,           // chainId
                'UNSTAKE',         // type
                undefined,         // data
                'ed25519',         // signatureScheme
                publicKey          // publicKey
            );
            tx.signature = signature;
            blockchain.addTransaction(tx);

            const epochInfo = stakingPool.getEpochInfo();
            log.info(`📊 UNSTAKE tx submitted: ${address.slice(0, 10)}... ${amount} LVE (nonce: ${nonce})`);

            res.json({
                success: true,
                data: {
                    message: `UNSTAKE transaction submitted. Will be processed when included in block.`,
                    txId: tx.id,
                    status: 'pending',
                    effectiveEpoch: epochInfo.epoch + 1,
                    remainingStake: stakingPool.getStake(address),
                },
            });
        } catch (error) {
            res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Unstaking failed' });
        }
    });

    router.post('/claim', requireSynced, validateStakingTx('CLAIM'), (req: Request, res: Response) => {
        const { address, signature, publicKey, nonce, chainId } = req.body;

        try {
            // Create CLAIM transaction for relay
            const tx = new Transaction(
                address,           // fromAddress (signer)
                'STAKE_POOL',      // toAddress (system address)
                0,                 // amount (claim returns available unstaked)
                0,                 // fee
                Date.now(),        // timestamp
                undefined,         // id
                nonce,             // nonce
                chainId,           // chainId
                'CLAIM',           // type
                undefined,         // data
                'ed25519',         // signatureScheme
                publicKey          // publicKey
            );
            tx.signature = signature;
            blockchain.addTransaction(tx);

            log.info(`📊 CLAIM tx submitted: ${address.slice(0, 10)}... (nonce: ${nonce})`);
            res.json({
                success: true,
                data: {
                    message: `CLAIM transaction submitted. Will be processed when included in block.`,
                    txId: tx.id,
                    status: 'pending',
                    pendingRequests: stakingPool.getUnstakeRequests(address),
                },
            });
        } catch (error) {
            res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Claim failed' });
        }
    });

    // ========== DELEGATION ==========

    router.post('/delegate', requireSynced, validateStakingTx('DELEGATE'), (req: Request, res: Response) => {
        const { delegator, validator, amount, signature, publicKey, nonce, chainId } = req.body;

        // Pre-check balance
        const availableBalance = blockchain.getAvailableBalance(delegator);
        if (availableBalance < amount) {
            res.status(400).json({ success: false, error: `Insufficient balance: ${availableBalance} < ${amount}` });
            return;
        }

        try {
            // Create DELEGATE transaction for relay
            const tx = new Transaction(
                delegator,         // fromAddress (signer)
                validator,         // toAddress (validator to delegate to)
                amount,            // amount to delegate
                0,                 // fee
                Date.now(),        // timestamp
                undefined,         // id
                nonce,             // nonce
                chainId,           // chainId
                'DELEGATE',        // type
                undefined,         // data
                'ed25519',         // signatureScheme
                publicKey          // publicKey
            );
            tx.signature = signature;
            blockchain.addTransaction(tx);

            const epochInfo = stakingPool.getEpochInfo();
            log.info(`📊 DELEGATE tx submitted: ${delegator.slice(0, 10)}... -> ${validator.slice(0, 10)}... ${amount} LVE (nonce: ${nonce})`);

            res.json({
                success: true,
                data: {
                    message: `DELEGATE transaction submitted. Will be processed when included in block.`,
                    txId: tx.id,
                    status: 'pending',
                    effectiveEpoch: epochInfo.epoch + 1,
                    delegations: stakingPool.getDelegations(delegator),
                },
            });
        } catch (error) {
            res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Delegation failed' });
        }
    });

    router.post('/undelegate', requireSynced, validateStakingTx('UNDELEGATE'), (req: Request, res: Response) => {
        const { delegator, validator, amount, signature, publicKey, nonce, chainId } = req.body;

        try {
            // Create UNDELEGATE transaction for relay
            const tx = new Transaction(
                delegator,         // fromAddress (signer)
                validator,         // toAddress (validator to undelegate from)
                amount,            // amount to undelegate
                0,                 // fee
                Date.now(),        // timestamp
                undefined,         // id
                nonce,             // nonce
                chainId,           // chainId
                'UNDELEGATE',      // type
                undefined,         // data
                'ed25519',         // signatureScheme
                publicKey          // publicKey
            );
            tx.signature = signature;
            blockchain.addTransaction(tx);

            log.info(`📊 UNDELEGATE tx submitted: ${delegator.slice(0, 10)}... from ${validator.slice(0, 10)}... ${amount} LVE (nonce: ${nonce})`);

            res.json({
                success: true,
                data: {
                    message: `UNDELEGATE transaction submitted. Will be processed when included in block.`,
                    txId: tx.id,
                    status: 'pending',
                    remainingDelegations: stakingPool.getDelegations(delegator),
                },
            });
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
                // Staking limits for frontend display
                limits: {
                    maxConcentration: config.staking.maxConcentration,
                    minCommission: config.staking.minCommission,
                    maxCommission: config.staking.maxCommission,
                    minValidatorStake: config.staking.minValidatorStake,
                },
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

    router.post('/commission', requireSynced, validateStakingTx('COMMISSION'), (req: Request, res: Response) => {
        const { address, commission, signature, publicKey, nonce, chainId } = req.body;

        // Validate commission limits
        const minCommission = config.staking?.minCommission ?? 0;
        const maxCommission = config.staking?.maxCommission ?? 30;

        if (commission < minCommission) {
            res.status(400).json({
                success: false,
                error: `Commission cannot be below ${minCommission}%`
            });
            return;
        }
        if (commission > maxCommission) {
            res.status(400).json({
                success: false,
                error: `Commission cannot exceed ${maxCommission}%`
            });
            return;
        }

        try {
            // Create COMMISSION transaction for relay
            const tx = new Transaction(
                address,           // fromAddress (signer/validator)
                'STAKE_POOL',      // toAddress (system address)
                commission,        // amount = new commission percentage
                0,                 // fee
                Date.now(),        // timestamp
                undefined,         // id
                nonce,             // nonce
                chainId,           // chainId
                'COMMISSION',      // type
                undefined,         // data
                'ed25519',         // signatureScheme
                publicKey          // publicKey
            );
            tx.signature = signature;
            blockchain.addTransaction(tx);

            log.info(`📊 COMMISSION tx submitted: ${address.slice(0, 10)}... set to ${commission}% (nonce: ${nonce})`);

            res.json({
                success: true,
                data: {
                    message: `COMMISSION transaction submitted. Will be processed when included in block.`,
                    txId: tx.id,
                    status: 'pending',
                },
            });
        } catch (error) {
            res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Commission update failed' });
        }
    });

    // ========== APY & REWARDS ==========

    router.get('/apy', (_req: Request, res: Response) => {
        const apyData = stakingPool.getNetworkAPY();
        res.json({
            success: true,
            data: {
                ...apyData,
                description: 'APY calculation based on current network state',
                formula: 'APY = (annual_block_rewards / total_staked) * 100',
            },
        });
    });

    router.post('/auto-compound', requireSynced, validateStakingTx('AUTO_COMPOUND'), (req: Request, res: Response) => {
        const { address, enabled, signature, publicKey, nonce, chainId } = req.body;

        try {
            const result = stakingPool.setAutoCompound(address, enabled);
            if (!result) {
                res.status(400).json({ success: false, error: 'Validator not found or update failed' });
                return;
            }

            log.info(`🔄 AUTO_COMPOUND ${enabled ? 'enabled' : 'disabled'}: ${address.slice(0, 10)}...`);
            res.json({
                success: true,
                data: {
                    message: `Auto-compound ${enabled ? 'enabled' : 'disabled'}`,
                    address,
                    autoCompound: enabled,
                },
            });
        } catch (error) {
            res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Auto-compound toggle failed' });
        }
    });

    // ========== SLASHING HISTORY ==========
    // NOTE: These routes MUST come BEFORE /:address to avoid being caught by wildcard

    router.get('/slashing-history', (req: Request, res: Response) => {
        const limit = parseInt(req.query.limit as string) || 50;
        const evidence = slashingManager.getEvidence().slice(-limit);

        res.json({
            success: true,
            data: {
                count: evidence.length,
                total: slashingManager.getEvidence().length,
                history: evidence.map(e => ({
                    validator: e.validator,
                    type: e.type,
                    slot: e.slot,
                    timestamp: e.timestamp,
                    penalty: e.penalty,
                    details: e.details,
                    date: new Date(e.timestamp).toISOString(),
                })),
            },
        });
    });

    router.get('/slashing-history/:validator', (req: Request, res: Response) => {
        const { validator } = req.params;
        const allEvidence = slashingManager.getEvidence();
        const filtered = allEvidence.filter(e => e.validator === validator);

        // Also get liveness info
        const liveness = slashingManager.getValidatorLiveness(validator);

        res.json({
            success: true,
            data: {
                validator,
                count: filtered.length,
                liveness,
                history: filtered.map(e => ({
                    type: e.type,
                    slot: e.slot,
                    timestamp: e.timestamp,
                    penalty: e.penalty,
                    details: e.details,
                    date: new Date(e.timestamp).toISOString(),
                })),
            },
        });
    });

    // ========== USER INFO ==========
    // NOTE: This wildcard route MUST come LAST

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
