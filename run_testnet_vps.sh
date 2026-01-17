#!/bin/bash
# EDU Chain - Testnet VPS Node Launcher
# Run: ./run_testnet_vps.sh

set -e

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║           EDU Chain - Testnet VPS Node                    ║"
echo "╚═══════════════════════════════════════════════════════════╝"

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+"
    exit 1
fi

# Check if npm dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Build if dist doesn't exist or src is newer
if [ ! -d "dist" ] || [ "src" -nt "dist" ]; then
    echo "🔨 Building project..."
    npm run build
fi

# Set environment for testnet
export NETWORK_MODE=testnet

echo "🚀 Starting EDU Chain Testnet Node..."
echo "📍 Network: testnet"
echo "🌐 API: http://0.0.0.0:3000"
echo "📡 P2P: ws://0.0.0.0:6001"
echo ""

# Run node with nohup for background execution (optional)
# Uncomment the line below to run in background:
# nohup npx edu-chain start --network testnet > testnet.log 2>&1 &

# Run in foreground (default)
npx edu-chain start --network testnet
