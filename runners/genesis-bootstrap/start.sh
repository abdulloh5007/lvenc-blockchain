#!/bin/bash
# =========================================================
# LVE Chain — Genesis Validator Start (PM2)
# =========================================================
# Starts the genesis validator node with PM2.
# Run after init.sh has completed successfully.
# =========================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
NETWORK="${NETWORK:-testnet}"
DATA_DIR="./data/${NETWORK}"
API_PORT="${API_PORT:-3001}"
P2P_PORT="${P2P_PORT:-6001}"
PM2_NAME="${PM2_NAME:-lve-genesis}"

echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║          LVE Chain — Genesis Validator (PM2)              ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if genesis is initialized
if [ ! -f "$DATA_DIR/genesis.json" ]; then
    echo -e "${RED}❌ Genesis not initialized!${NC}"
    echo "   Run: ./runners/genesis-bootstrap/init.sh"
    exit 1
fi

if [ ! -f "$DATA_DIR/priv_validator_key.json" ]; then
    echo -e "${RED}❌ Validator key not found!${NC}"
    echo "   Run: ./runners/genesis-bootstrap/init.sh"
    exit 1
fi

# Check PM2
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}📦 Installing PM2...${NC}"
    npm install -g pm2
fi

echo -e "${YELLOW}Configuration:${NC}"
echo "  Network:   $NETWORK"
echo "  PM2 Name:  $PM2_NAME"
echo "  API Port:  $API_PORT"
echo "  P2P Port:  $P2P_PORT"
echo ""

# Stop existing if running
pm2 delete "$PM2_NAME" 2>/dev/null || true

# Start with PM2
echo -e "${GREEN}🚀 Starting genesis validator with PM2...${NC}"
echo ""

NETWORK_MODE="$NETWORK" pm2 start node \
    --name "$PM2_NAME" \
    --interpreter none \
    -- dist/node/cli/cli.js start \
    --role validator \
    --port "$API_PORT" \
    --p2p "$P2P_PORT" \
    --data "$DATA_DIR" \
    --network "$NETWORK"

# Save PM2 config
pm2 save

echo ""
echo -e "${GREEN}✅ Node started with PM2!${NC}"
echo ""
echo "Commands:"
echo "  pm2 logs $PM2_NAME     # View logs"
echo "  pm2 status             # Check status"
echo "  pm2 restart $PM2_NAME  # Restart node"
echo "  pm2 stop $PM2_NAME     # Stop node"
echo ""

# Show logs for a moment
pm2 logs "$PM2_NAME" --lines 20 --nostream
