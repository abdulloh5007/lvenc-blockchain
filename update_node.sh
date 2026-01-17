#!/bin/bash
# EDU Chain - Node Update Script
# Run: ./update_node.sh

echo ""
echo "╔═══════════════════════════════════════════════════╗"
echo "║          EDU Chain Node Update                    ║"
echo "╚═══════════════════════════════════════════════════╝"
echo ""

# Check if git is available
if ! command -v git &> /dev/null; then
    echo "❌ Git is not installed"
    exit 1
fi

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo "❌ Not a git repository. Run from the project root."
    exit 1
fi

echo "📥 Pulling latest changes..."
git pull

if [ $? -ne 0 ]; then
    echo "❌ Git pull failed. Resolve conflicts and try again."
    exit 1
fi

echo "📦 Installing dependencies..."
npm install

echo "🔨 Building..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed. Check for errors above."
    exit 1
fi

echo ""
echo "╔═══════════════════════════════════════════════════╗"
echo "║         ✅ Update Complete!                       ║"
echo "╠═══════════════════════════════════════════════════╣"
echo "║  Restart your node:                               ║"
echo "║    ./run_testnet.sh                               ║"
echo "║    ./run_mainnet.sh                               ║"
echo "╚═══════════════════════════════════════════════════╝"
echo ""
