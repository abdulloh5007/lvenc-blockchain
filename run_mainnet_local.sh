#!/bin/bash
# EDU Chain - Mainnet Node Launcher
# Run: ./run_mainnet.sh

echo "🚀 Starting EDU Chain Mainnet Node..."
npm run build && npx lve-chain start --network mainnet
