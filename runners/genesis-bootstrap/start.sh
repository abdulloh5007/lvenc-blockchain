#!/bin/bash
# =========================================================
# LVE Chain — Genesis Validator Start Script (PM2)
# =========================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

source "$SCRIPT_DIR/../lib/box.sh"

cd "$PROJECT_DIR"

NETWORK="${NETWORK:-testnet}"
DATA_DIR="./data/${NETWORK}"
API_PORT="${API_PORT:-3001}"
P2P_PORT="${P2P_PORT:-6001}"
PM2_NAME="${PM2_NAME:-lve-genesis}"

echo ""
lve_header "Genesis Validator (PM2)"

# Check prerequisites
if [ ! -f "$DATA_DIR/genesis.json" ]; then
    msg_err "Genesis not found!"
    echo "   ➜ Run: ./runners/genesis-bootstrap/init.sh"
    exit 1
fi

if [ ! -f "$DATA_DIR/priv_validator_key.json" ]; then
    msg_err "Validator key not found!"
    echo "   ➜ Run: ./runners/genesis-bootstrap/init.sh"
    exit 1
fi

# Install PM2 if not present
if ! command -v pm2 &> /dev/null; then
    msg_warn "PM2 not found, installing..."
    npm install -g pm2
fi

# Stop existing process
if pm2 list 2>/dev/null | grep -q "$PM2_NAME"; then
    msg_info "Stopping existing $PM2_NAME..."
    pm2 delete "$PM2_NAME" 2>/dev/null || true
fi

# Start with PM2
msg_info "🚀 Starting node..."
pm2 start node \
    --name "$PM2_NAME" \
    --cwd "$PROJECT_DIR" \
    -- dist/node/cli/cli.js start \
    --role validator \
    --port "$API_PORT" \
    --p2p "$P2P_PORT" \
    --network "$NETWORK" \
    -d "$DATA_DIR"

pm2 save

echo ""
quick_box "✅ Genesis Validator Running!" \
    "Name: $PM2_NAME" \
    "API: http://localhost:$API_PORT" \
    "P2P: $P2P_PORT"
echo ""
echo "  📋 Commands:"
echo "     pm2 logs $PM2_NAME    # View logs"
echo "     pm2 stop $PM2_NAME    # Stop"
echo "     pm2 restart $PM2_NAME # Restart"
echo ""
