#!/bin/bash
# EDU Chain - Mainnet Node Launcher
# Run: ./run_mainnet.sh

echo "🚀 Starting EDU Chain Mainnet Node..."
npm run build && npx edu-chain start --network mainnet
