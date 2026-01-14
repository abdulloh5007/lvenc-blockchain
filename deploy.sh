#!/bin/bash

# EDU Chain Blockchain - Deploy Script
# Pulls latest code, rebuilds, and restarts PM2

set -e

PROJECT_DIR="/root/lvenc-blockchain"
PM2_APP_NAME="lvenc-blockchain"

echo "🚀 Deploying EDU Chain..."
echo "=========================="

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

# Restart PM2
echo ""
echo "🔄 Restarting PM2..."
pm2 restart $PM2_APP_NAME

# Show status
echo ""
echo "✅ Deployment complete!"
echo ""
pm2 status

# Show logs
echo ""
echo "📋 Recent logs:"
echo "------------------------"
pm2 logs $PM2_APP_NAME --lines 15 --nostream
