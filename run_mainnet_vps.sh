#!/bin/bash
# EDU Chain - Mainnet VPS Node Launcher with PM2
# Run: ./run_mainnet_vps.sh

set -e

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║           EDU Chain - Mainnet VPS Node (PM2)              ║"
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

# Set environment for mainnet
export NETWORK_MODE=mainnet

echo ""
echo "🚀 Starting EDU Chain Mainnet Node with PM2..."
echo "📍 Network: mainnet"
echo "🌐 API: http://0.0.0.0:3000"
echo "📡 P2P: ws://0.0.0.0:6001"
echo ""
echo "⚠️  WARNING: This is MAINNET - real tokens!"
echo ""

# Stop existing instance if running
pm2 delete lve-mainnet 2>/dev/null || true

# Start with PM2
pm2 start "npx lve-chain start --network mainnet" --name lve-mainnet

# Save PM2 process list (survives reboot)
pm2 save

echo ""
echo "✅ Node started! Useful commands:"
echo "   pm2 logs lve-mainnet     # View logs"
echo "   pm2 status               # Check status"  
echo "   pm2 restart lve-mainnet  # Restart node"
echo "   pm2 stop lve-mainnet     # Stop node"
echo ""
