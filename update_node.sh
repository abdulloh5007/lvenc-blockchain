#!/bin/bash
# LVE Chain - Node Update Script v2.1.0
# Run: ./update_node.sh

echo ""
echo "╔═══════════════════════════════════════════════════╗"
echo "║          LVE Chain Node Update                    ║"
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
echo "║  Restart your node using runners:                 ║"
echo "║                                                   ║"
echo "║    ./runners/genesis-bootstrap/start.sh (Genesis) ║"
echo "║    ./runners/rpc/start.sh       (RPC + API)       ║"
echo "║    ./runners/full/start.sh      (Full node)       ║"
echo "║    ./runners/validator/start.sh (Validator)       ║"
echo "║    ./runners/light/start.sh     (Light node)      ║"
echo "╚═══════════════════════════════════════════════════╝"
echo ""

# Auto-restart PM2 if running
PM2_NAME="${PM2_NAME:-lve-genesis}"
if command -v pm2 &> /dev/null; then
    if pm2 list 2>/dev/null | grep -q "$PM2_NAME"; then
        echo "🔄 Restarting $PM2_NAME via PM2..."
        pm2 restart "$PM2_NAME"
        echo "✅ Node restarted!"
        echo ""
        pm2 logs "$PM2_NAME" --lines 10 --nostream
    fi
fi

