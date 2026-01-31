import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'LVE Chain API',
            version: '1.3.0',
            description: `
## LVE Chain - Educational Blockchain Network

Децентрализованная блокчейн-сеть с Proof-of-Stake консенсусом.

### Особенности:
- **Proof-of-Stake** консенсус с VRF выбором валидаторов
- **Enterprise Security**: Stateful Replay Verification и защита от Long Range Attack
- **NFT** поддержка с IPFS хранилищем
- **HD кошельки** с BIP39 мнемониками
- **Стейкинг** с делегированием
- **P2P сеть** с автоматической синхронизацией

### Сети:
- **Mainnet**: LVE_ адреса
- **Testnet**: tLVE_ адреса

### Версия протокола: 1
            `,
            contact: {
                name: 'LVENC Team',
                url: 'https://lvenc.site',
            },
            license: {
                name: 'MIT',
                url: 'https://opensource.org/licenses/MIT',
            },
        },
        servers: [
            {
                url: 'http://localhost:3001/api',
                description: 'Development server (CLI mode)',
            },
            {
                url: 'http://localhost:3001/api/v1',
                description: 'Development server (server mode)',
            },
            {
                url: 'https://api.lvenc.site/api/v1',
                description: 'Production server',
            },
        ],
        tags: [
            { name: 'Node', description: 'Статус и identity ноды' },
            { name: 'Network', description: 'P2P сеть и пиры' },
            { name: 'Blockchain', description: 'Блокчейн данные' },
            { name: 'Wallet', description: 'Управление кошельками' },
            { name: 'Transaction', description: 'Транзакции' },
            { name: 'Staking', description: 'Стейкинг и делегирование' },
            { name: 'NFT', description: 'NFT операции' },
            { name: 'IPFS', description: 'IPFS хранилище файлов' },
        ],
        components: {
            schemas: {
                NFT: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', description: 'Unique NFT ID' },
                        tokenId: { type: 'integer', description: 'Token number' },
                        creator: { type: 'string', description: 'Creator address' },
                        owner: { type: 'string', description: 'Current owner address' },
                        metadata: { $ref: '#/components/schemas/NFTMetadata' },
                        royalty: { type: 'number', description: 'Royalty percentage (0-10)' },
                        createdAt: { type: 'integer', description: 'Creation timestamp' },
                    },
                },
                NFTMetadata: {
                    type: 'object',
                    properties: {
                        name: { type: 'string', description: 'NFT name' },
                        description: { type: 'string', description: 'NFT description' },
                        image: { type: 'string', description: 'Image URL (ipfs:// or data:)' },
                        attributes: {
                            type: 'array',
                            items: { $ref: '#/components/schemas/NFTAttribute' },
                        },
                    },
                    required: ['name', 'image'],
                },
                NFTAttribute: {
                    type: 'object',
                    properties: {
                        trait_type: { type: 'string' },
                        value: { type: 'string' },
                    },
                },
                Collection: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        name: { type: 'string' },
                        symbol: { type: 'string' },
                        creator: { type: 'string' },
                        maxSupply: { type: 'integer' },
                        mintedCount: { type: 'integer' },
                    },
                },
                IPFSUploadResult: {
                    type: 'object',
                    properties: {
                        cid: { type: 'string', description: 'IPFS Content ID' },
                        ipfsUrl: { type: 'string', description: 'ipfs:// URL' },
                        gatewayUrl: { type: 'string', description: 'HTTP gateway URL' },
                        size: { type: 'integer', description: 'File size in bytes' },
                    },
                },
                Error: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', example: false },
                        error: { type: 'string' },
                    },
                },
                Success: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', example: true },
                        data: { type: 'object' },
                    },
                },
                NodeStatus: {
                    type: 'object',
                    properties: {
                        identity: {
                            type: 'object',
                            properties: {
                                nodeId: { type: 'string', description: 'Ed25519 public key' },
                                shortId: { type: 'string' },
                                rewardAddress: { type: 'string', nullable: true },
                                createdAt: { type: 'integer' },
                            },
                        },
                        version: {
                            type: 'object',
                            properties: {
                                nodeVersion: { type: 'string', example: '1.2.0' },
                                protocolVersion: { type: 'integer', example: 1 },
                                status: { type: 'string', enum: ['UP_TO_DATE', 'OUTDATED_WITHIN_GRACE', 'OUTDATED_GRACE_EXPIRED'] },
                                graceUntilBlock: { type: 'integer', nullable: true },
                            },
                        },
                        network: {
                            type: 'object',
                            properties: {
                                chainId: { type: 'string', example: 'testnet' },
                                peers: { type: 'integer' },
                                blockHeight: { type: 'integer' },
                            },
                        },
                        warnings: { type: 'array', items: { type: 'string' } },
                    },
                },
                // ==================== BLOCKCHAIN SCHEMAS ====================
                Block: {
                    type: 'object',
                    properties: {
                        index: { type: 'integer', description: 'Block number (height)' },
                        timestamp: { type: 'integer', description: 'Unix timestamp' },
                        previousHash: { type: 'string', description: 'Hash of previous block' },
                        hash: { type: 'string', description: 'Block hash' },
                        transactions: {
                            type: 'array',
                            items: { $ref: '#/components/schemas/Transaction' },
                        },
                        validator: { type: 'string', description: 'Validator address who produced block' },
                        nonce: { type: 'integer' },
                    },
                },
                Transaction: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', description: 'Transaction ID (hash)' },
                        fromAddress: { type: 'string', description: 'Sender address', nullable: true },
                        toAddress: { type: 'string', description: 'Recipient address' },
                        amount: { type: 'number', description: 'Amount in LVE' },
                        fee: { type: 'number', description: 'Transaction fee' },
                        timestamp: { type: 'integer', description: 'Unix timestamp' },
                        signature: { type: 'string', description: 'Transaction signature' },
                        type: { type: 'string', enum: ['transfer', 'reward', 'stake', 'unstake', 'fee'] },
                    },
                },
                // ==================== WALLET SCHEMAS ====================
                WalletBalance: {
                    type: 'object',
                    properties: {
                        address: { type: 'string', description: 'Wallet address' },
                        balance: { type: 'number', description: 'Available balance' },
                        symbol: { type: 'string', example: 'LVE' },
                    },
                },
                WalletData: {
                    type: 'object',
                    properties: {
                        publicKey: { type: 'string', description: 'secp256k1 public key' },
                        address: { type: 'string', description: 'LVE address (LVE_ or tLVE_)' },
                        label: { type: 'string', nullable: true },
                        createdAt: { type: 'integer' },
                    },
                },
                // ==================== STAKING SCHEMAS ====================
                StakingInfo: {
                    type: 'object',
                    properties: {
                        address: { type: 'string' },
                        stakedAmount: { type: 'number', description: 'Amount staked' },
                        pendingRewards: { type: 'number', description: 'Unclaimed rewards' },
                        pendingUnstake: { type: 'number', description: 'Amount pending unstake' },
                        isValidator: { type: 'boolean' },
                        delegatedTo: { type: 'string', nullable: true },
                    },
                },
                Validator: {
                    type: 'object',
                    properties: {
                        address: { type: 'string', description: 'Validator address' },
                        publicKey: { type: 'string', description: 'Ed25519 public key' },
                        stake: { type: 'number', description: 'Total stake (own + delegated)' },
                        commission: { type: 'number', description: 'Commission rate (0-100%)' },
                        blocksProduced: { type: 'integer' },
                        uptime: { type: 'number', description: 'Uptime percentage' },
                    },
                },
                EpochInfo: {
                    type: 'object',
                    properties: {
                        currentEpoch: { type: 'integer' },
                        epochDuration: { type: 'integer', description: 'Blocks per epoch' },
                        startBlock: { type: 'integer' },
                        endBlock: { type: 'integer' },
                        currentBlock: { type: 'integer' },
                        blocksRemaining: { type: 'integer' },
                        progress: { type: 'integer', description: 'Epoch progress (0-100%)' },
                    },
                },
                StakingStats: {
                    type: 'object',
                    properties: {
                        totalStaked: { type: 'number', description: 'Total staked tokens' },
                        totalValidators: { type: 'integer' },
                        activeValidators: { type: 'integer' },
                        apy: { type: 'number', description: 'Annual percentage yield' },
                        minStake: { type: 'number', description: 'Minimum stake required' },
                    },
                },
                // ==================== PEER SCHEMAS ====================
                Peer: {
                    type: 'object',
                    properties: {
                        url: { type: 'string', description: 'Peer WebSocket URL' },
                        ip: { type: 'string' },
                        verified: { type: 'boolean' },
                        score: { type: 'integer', description: 'Peer reputation score' },
                        connectedAt: { type: 'integer' },
                    },
                },
            },
        },
        paths: {
            // ==================== NODE ENDPOINTS ====================
            '/node/status': {
                get: {
                    tags: ['Node'],
                    summary: 'Полный статус ноды',
                    description: 'Информация об identity, версии, сети и предупреждениях',
                    responses: {
                        200: {
                            description: 'Node status',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            success: { type: 'boolean' },
                                            data: { $ref: '#/components/schemas/NodeStatus' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            '/node/health': {
                get: {
                    tags: ['Node'],
                    summary: 'Health check',
                    description: 'Быстрая проверка работоспособности ноды',
                    responses: {
                        200: {
                            description: 'Healthy',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            status: { type: 'string', example: 'healthy' },
                                            blockHeight: { type: 'integer' },
                                            peers: { type: 'integer' },
                                            timestamp: { type: 'integer' },
                                        },
                                    },
                                },
                            },
                        },
                        503: { description: 'Unhealthy' },
                    },
                },
            },
            '/network/identity': {
                get: {
                    tags: ['Network'],
                    summary: 'Get node identity',
                    description: 'Публичная информация о криптографической identity ноды',
                    responses: {
                        200: {
                            description: 'Node identity',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            success: { type: 'boolean' },
                                            data: {
                                                type: 'object',
                                                properties: {
                                                    nodeId: { type: 'string' },
                                                    rewardAddress: { type: 'string', nullable: true },
                                                    createdAt: { type: 'integer' },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            '/network/identity/reward': {
                post: {
                    tags: ['Network'],
                    summary: 'Bind reward address',
                    description: 'Привязать адрес кошелька для получения наград валидатора',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        rewardAddress: { type: 'string', description: 'Wallet address (tLVE_... or LVE_...)' },
                                    },
                                    required: ['rewardAddress'],
                                },
                            },
                        },
                    },
                    responses: {
                        200: { description: 'Address bound successfully' },
                        400: { description: 'Invalid address' },
                    },
                },
            },
            '/network/peers': {
                get: {
                    tags: ['Network'],
                    summary: 'Get connected peers',
                    description: 'Список подключённых пиров',
                    responses: {
                        200: {
                            description: 'Peers list',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            success: { type: 'boolean' },
                                            data: {
                                                type: 'object',
                                                properties: {
                                                    peers: { type: 'array', items: { type: 'object' } },
                                                    count: { type: 'integer' },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },

            // ==================== BLOCKCHAIN ENDPOINTS ====================
            '/blockchain': {
                get: {
                    tags: ['Blockchain'],
                    summary: 'Get blockchain stats',
                    description: 'Общая статистика блокчейна',
                    responses: {
                        200: {
                            description: 'Blockchain stats',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            success: { type: 'boolean' },
                                            data: {
                                                type: 'object',
                                                properties: {
                                                    blocks: { type: 'integer' },
                                                    transactions: { type: 'integer' },
                                                    totalSupply: { type: 'number' },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            '/blockchain/blocks': {
                get: {
                    tags: ['Blockchain'],
                    summary: 'Get paginated blocks',
                    description: 'Получить блоки с пагинацией (новые первыми)',
                    parameters: [
                        { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
                        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
                    ],
                    responses: {
                        200: { description: 'Paginated blocks' },
                    },
                },
            },
            '/blockchain/latest': {
                get: {
                    tags: ['Blockchain'],
                    summary: 'Get latest block',
                    responses: { 200: { description: 'Latest block' } },
                },
            },
            '/blockchain/block/{hash}': {
                get: {
                    tags: ['Blockchain'],
                    summary: 'Get block by hash',
                    parameters: [
                        { name: 'hash', in: 'path', required: true, schema: { type: 'string' } },
                    ],
                    responses: {
                        200: { description: 'Block data' },
                        404: { description: 'Block not found' },
                    },
                },
            },
            '/blockchain/block/index/{index}': {
                get: {
                    tags: ['Blockchain'],
                    summary: 'Get block by index',
                    parameters: [
                        { name: 'index', in: 'path', required: true, schema: { type: 'integer' } },
                    ],
                    responses: {
                        200: { description: 'Block data' },
                        404: { description: 'Block not found' },
                    },
                },
            },
            '/blockchain/validate': {
                get: {
                    tags: ['Blockchain'],
                    summary: 'Validate blockchain',
                    description: 'Проверить целостность цепочки',
                    responses: {
                        200: {
                            description: 'Validation result',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            success: { type: 'boolean' },
                                            data: {
                                                type: 'object',
                                                properties: {
                                                    valid: { type: 'boolean' },
                                                    blocks: { type: 'integer' },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            '/blockchain/fee': {
                get: {
                    tags: ['Blockchain'],
                    summary: 'Get recommended fees',
                    description: 'Рекомендуемые комиссии на основе загруженности мемпула',
                    responses: { 200: { description: 'Fee recommendations' } },
                },
            },

            // ==================== WALLET ENDPOINTS ====================
            '/wallet/{address}/balance': {
                get: {
                    tags: ['Wallet'],
                    summary: 'Get wallet balance',
                    parameters: [
                        { name: 'address', in: 'path', required: true, schema: { type: 'string' } },
                    ],
                    responses: {
                        200: {
                            description: 'Balance',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            success: { type: 'boolean' },
                                            data: {
                                                type: 'object',
                                                properties: {
                                                    address: { type: 'string' },
                                                    balance: { type: 'number' },
                                                    symbol: { type: 'string', example: 'LVE' },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            '/wallet/{address}/transactions': {
                get: {
                    tags: ['Wallet'],
                    summary: 'Get transaction history',
                    parameters: [
                        { name: 'address', in: 'path', required: true, schema: { type: 'string' } },
                    ],
                    responses: { 200: { description: 'Transaction history' } },
                },
            },
            '/wallet/batch-balances': {
                post: {
                    tags: ['Wallet'],
                    summary: 'Get balances for multiple addresses',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        addresses: {
                                            type: 'array',
                                            items: { type: 'string' }
                                        }
                                    },
                                    required: ['addresses']
                                }
                            }
                        }
                    },
                    responses: {
                        200: { description: 'Batch balances returned' }
                    }
                },
            },

            // ==================== TRANSACTION ENDPOINTS ====================
            '/transaction/send': {
                post: {
                    tags: ['Transaction'],
                    summary: 'Send transaction',
                    description: 'Отправить подписанную транзакцию',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        from: { type: 'string', description: 'Sender address' },
                                        to: { type: 'string', description: 'Recipient address' },
                                        amount: { type: 'number', description: 'Amount to send' },
                                        fee: { type: 'number', description: 'Transaction fee', default: 0.01 },
                                        signature: { type: 'string', description: 'Transaction signature (Ed25519)' },
                                        publicKey: { type: 'string', description: 'Sender public key' },
                                        timestamp: { type: 'integer', description: 'Transaction timestamp' },
                                        nonce: { type: 'integer', description: 'Replay protection nonce (required)' },
                                        chainId: { type: 'string', description: 'Chain ID (required)' },
                                    },
                                    required: ['from', 'to', 'amount', 'signature', 'publicKey', 'nonce', 'chainId'],
                                },
                            },
                        },
                    },
                    responses: {
                        200: { description: 'Transaction sent' },
                        400: { description: 'Invalid transaction' },
                        403: { description: 'Address blacklisted' },
                        429: { description: 'Rate limit exceeded' },
                    },
                },
            },
            '/transaction/{id}': {
                get: {
                    tags: ['Transaction'],
                    summary: 'Get transaction by ID',
                    parameters: [
                        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
                    ],
                    responses: {
                        200: { description: 'Transaction details' },
                        404: { description: 'Transaction not found' },
                    },
                },
            },
            '/transaction/pool/pending': {
                get: {
                    tags: ['Transaction'],
                    summary: 'Get pending transactions',
                    description: 'Транзакции в мемпуле, ожидающие включения в блок',
                    responses: { 200: { description: 'Pending transactions' } },
                },
            },

            // ==================== STAKING ENDPOINTS ====================
            '/staking/epoch': {
                get: {
                    tags: ['Staking'],
                    summary: 'Get epoch info',
                    description: 'Информация о текущей эпохе',
                    responses: {
                        200: {
                            description: 'Epoch info',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            success: { type: 'boolean' },
                                            data: {
                                                type: 'object',
                                                properties: {
                                                    currentEpoch: { type: 'integer' },
                                                    epochDuration: { type: 'integer' },
                                                    startBlock: { type: 'integer' },
                                                    endBlock: { type: 'integer' },
                                                    currentBlock: { type: 'integer' },
                                                    blocksRemaining: { type: 'integer' },
                                                    progress: { type: 'integer' },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            '/staking/stake': {
                post: {
                    tags: ['Staking'],
                    summary: 'Stake tokens',
                    description: 'Застейкать токены для участия в консенсусе',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        address: { type: 'string' },
                                        amount: { type: 'number' },
                                        publicKey: { type: 'string', description: 'Validator public key' },
                                        signature: { type: 'string', description: 'Ed25519 signature' },
                                        nonce: { type: 'integer' },
                                        chainId: { type: 'string' },
                                    },
                                    required: ['address', 'amount', 'publicKey', 'signature', 'nonce', 'chainId'],
                                },
                            },
                        },
                    },
                    responses: {
                        200: { description: 'Stake successful' },
                        400: { description: 'Invalid request' },
                    },
                },
            },
            '/staking/unstake': {
                post: {
                    tags: ['Staking'],
                    summary: 'Unstake tokens',
                    description: 'Вывести токены из стейкинга (применяется после эпохи)',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        address: { type: 'string' },
                                        amount: { type: 'number' },
                                    },
                                    required: ['address', 'amount'],
                                },
                            },
                        },
                    },
                    responses: {
                        200: { description: 'Unstake queued' },
                        400: { description: 'Invalid request' },
                    },
                },
            },
            '/staking/validators': {
                get: {
                    tags: ['Staking'],
                    summary: 'Get validators list',
                    description: 'Список активных валидаторов',
                    responses: { 200: { description: 'Validators list' } },
                },
            },
            '/staking/stats': {
                get: {
                    tags: ['Staking'],
                    summary: 'Get staking stats',
                    description: 'Общая статистика стейкинга',
                    responses: { 200: { description: 'Staking statistics' } },
                },
            },
            '/staking/{address}': {
                get: {
                    tags: ['Staking'],
                    summary: 'Get staking info for address',
                    parameters: [
                        { name: 'address', in: 'path', required: true, schema: { type: 'string' } },
                    ],
                    responses: { 200: { description: 'User staking info' } },
                },
            },

            // ==================== NFT ENDPOINTS ====================
            '/nft': {
                get: {
                    tags: ['NFT'],
                    summary: 'Get all NFTs',
                    responses: {
                        200: {
                            description: 'List of NFTs',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            success: { type: 'boolean' },
                                            data: {
                                                type: 'array',
                                                items: { $ref: '#/components/schemas/NFT' },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            '/nft/{id}': {
                get: {
                    tags: ['NFT'],
                    summary: 'Get NFT by ID',
                    parameters: [
                        {
                            name: 'id',
                            in: 'path',
                            required: true,
                            schema: { type: 'string' },
                        },
                    ],
                    responses: {
                        200: { description: 'NFT details' },
                        404: { description: 'NFT not found' },
                    },
                },
            },
            '/nft/mint': {
                post: {
                    tags: ['NFT'],
                    summary: 'Mint new NFT',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        creator: { type: 'string', description: 'Creator wallet address' },
                                        metadata: { $ref: '#/components/schemas/NFTMetadata' },
                                        privateKey: { type: 'string', description: 'Private key for signing' },
                                        royalty: { type: 'number', default: 5 },
                                    },
                                    required: ['creator', 'metadata', 'privateKey'],
                                },
                            },
                        },
                    },
                    responses: {
                        200: { description: 'NFT created' },
                        400: { description: 'Invalid request' },
                        403: { description: 'Invalid private key' },
                        429: { description: 'Rate limit exceeded' },
                    },
                },
            },
            '/nft/transfer': {
                post: {
                    tags: ['NFT'],
                    summary: 'Transfer NFT to another address',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        nftId: { type: 'string' },
                                        to: { type: 'string' },
                                        privateKey: { type: 'string' },
                                    },
                                    required: ['nftId', 'to', 'privateKey'],
                                },
                            },
                        },
                    },
                    responses: {
                        200: { description: 'Transfer successful' },
                        403: { description: 'Not owner' },
                        404: { description: 'NFT not found' },
                    },
                },
            },
            '/nft/owner/{address}': {
                get: {
                    tags: ['NFT'],
                    summary: 'Get NFTs by owner',
                    parameters: [
                        {
                            name: 'address',
                            in: 'path',
                            required: true,
                            schema: { type: 'string' },
                        },
                    ],
                    responses: {
                        200: { description: 'List of NFTs' },
                    },
                },
            },
            '/ipfs/status': {
                get: {
                    tags: ['IPFS'],
                    summary: 'Get IPFS connection status',
                    responses: {
                        200: {
                            description: 'IPFS status',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            success: { type: 'boolean' },
                                            data: {
                                                type: 'object',
                                                properties: {
                                                    connected: { type: 'boolean' },
                                                    peerId: { type: 'string' },
                                                    gatewayUrl: { type: 'string' },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            '/ipfs/upload': {
                post: {
                    tags: ['IPFS'],
                    summary: 'Upload file to IPFS',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        data: { type: 'string', description: 'Base64 encoded file' },
                                        filename: { type: 'string' },
                                    },
                                    required: ['data'],
                                },
                            },
                        },
                    },
                    responses: {
                        200: {
                            description: 'Upload successful',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            success: { type: 'boolean' },
                                            data: { $ref: '#/components/schemas/IPFSUploadResult' },
                                        },
                                    },
                                },
                            },
                        },
                        503: { description: 'IPFS not available' },
                    },
                },
            },
            '/ipfs/file/{cid}': {
                get: {
                    tags: ['IPFS'],
                    summary: 'Get file from IPFS',
                    parameters: [
                        {
                            name: 'cid',
                            in: 'path',
                            required: true,
                            schema: { type: 'string' },
                        },
                    ],
                    responses: {
                        200: { description: 'File content' },
                        404: { description: 'File not found' },
                    },
                },
            },
        },
    },
    apis: [], // We define inline above
};

export const swaggerSpec = swaggerJsdoc(options);
