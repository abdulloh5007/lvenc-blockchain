#!/bin/bash

# EDU Chain Blockchain - Deploy Script
# Pulls latest code, rebuilds, and restarts both API and Bootstrap node

set -e

PROJECT_DIR="/root/lvenc-blockchain"
PM2_API_NAME="lvenc-api"
PM2_BOOTSTRAP_NAME="edu-bootstrap"

echo "🚀 Deploying EDU Chain..."
echo "========================="

# Navigate to project
cd $PROJECT_DIR
echo "📁 Working directory: $(pwd)"

# Pull latest code
echo ""
echo "📥 Pulling latest changes..."
git pull

# Install dependencies (if package.json changed)
echo ""
echo "📦 Installing dependencies..."
npm install

# Build TypeScript
echo ""
echo "🔨 Building..."
npm run build

# === API Server ===
echo ""
echo "🌍 Setting up API Server..."
if pm2 describe $PM2_API_NAME > /dev/null 2>&1; then
    pm2 restart $PM2_API_NAME
else
    pm2 start dist/api/server.js --name $PM2_API_NAME --cwd $PROJECT_DIR
fi

# === Bootstrap Node ===
echo ""
echo "🔗 Setting up Bootstrap Node..."
if pm2 describe $PM2_BOOTSTRAP_NAME > /dev/null 2>&1; then
    pm2 restart $PM2_BOOTSTRAP_NAME
else
    pm2 start dist/cli/cli.js --name $PM2_BOOTSTRAP_NAME --cwd $PROJECT_DIR -- start --bootstrap --p2p 6002 --port 3002 --network testnet
fi

# Save PM2 config
pm2 save

# Show status
echo ""
echo "✅ Deployment complete!"
echo ""
pm2 status

# Show logs
echo ""
echo "📋 API Server logs:"
echo "------------------------"
pm2 logs $PM2_API_NAME --lines 5 --nostream

echo ""
echo "📋 Bootstrap Node logs:"
echo "------------------------"
pm2 logs $PM2_BOOTSTRAP_NAME --lines 5 --nostream

