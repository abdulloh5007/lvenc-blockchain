module.exports = {
    apps: [{
        name: "lve-validator",
        script: "./dist/node/cli/cli.js",
        args: "start --role validator --network testnet --p2p 6002 --data ./data",
        env: {
            NODE_ENV: "production",
            // ⚠️ REPLACE THESE WITH YOUR WALLET INFO
            GENESIS_ADDRESS: "tLVE...",
            GENESIS_PUBLIC_KEY: "..."
        }
    }]
}
