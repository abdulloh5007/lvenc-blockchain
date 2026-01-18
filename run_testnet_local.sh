#!/bin/bash
# EDU Chain - Testnet Node Launcher
# Run: ./run_testnet.sh

echo "🚀 Starting EDU Chain Testnet Node..."
npm run build && npx lve-chain start --network testnet
