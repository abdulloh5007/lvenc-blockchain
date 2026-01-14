import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'EDU Chain API',
            version: '1.0.0',
            description: 'Blockchain and NFT API for EDU Chain',
            contact: {
                name: 'EDU Chain',
                url: 'https://lvenc.site',
            },
        },
        servers: [
            {
                url: 'http://localhost:3001/api/v1',
                description: 'Development server',
            },
            {
                url: 'https://api.lvenc.site/api/v1',
                description: 'Production server',
            },
        ],
        tags: [
            { name: 'NFT', description: 'NFT operations' },
            { name: 'IPFS', description: 'IPFS file storage' },
            { name: 'Blockchain', description: 'Blockchain data' },
            { name: 'Wallet', description: 'Wallet management' },
            { name: 'Transaction', description: 'Transaction operations' },
            { name: 'Mining', description: 'Mining operations' },
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
            },
        },
        paths: {
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
