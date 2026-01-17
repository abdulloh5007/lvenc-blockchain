#!/bin/bash
# EDU Chain - Testnet Node Launcher
# Run: ./run_testnet.sh

echo "🚀 Starting EDU Chain Testnet Node..."
npm run build && npx edu-chain start --network testnet
