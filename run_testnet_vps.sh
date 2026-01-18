#!/bin/bash
# EDU Chain - Testnet VPS Node Launcher with PM2
# Run: ./run_testnet_vps.sh

set -e

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║           EDU Chain - Testnet VPS Node (PM2)              ║"
echo "╚═══════════════════════════════════════════════════════════╝"

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+"
    exit 1
fi

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2..."
    npm install -g pm2
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

echo ""
echo "🚀 Starting EDU Chain Testnet Node with PM2..."
echo "📍 Network: testnet"
echo "🌐 API: http://0.0.0.0:3000"
echo "📡 P2P: ws://0.0.0.0:6001"
echo ""

# Stop existing instance if running
pm2 delete lve-testnet 2>/dev/null || true

# Start with PM2
pm2 start "npx lve-chain start --network testnet" --name lve-testnet

# Save PM2 process list (survives reboot)
pm2 save

echo ""
echo "✅ Node started! Useful commands:"
echo "   pm2 logs lve-testnet     # View logs"
echo "   pm2 status               # Check status"
echo "   pm2 restart lve-testnet  # Restart node"
echo "   pm2 stop lve-testnet     # Stop node"
echo ""
