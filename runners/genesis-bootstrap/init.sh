#!/bin/bash
# =========================================================
# LVE Chain — Genesis Bootstrap Script
# =========================================================
# This script initializes the FIRST genesis validator node.
# Run this ONCE on your VPS before starting the node.
# =========================================================

set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Source box utilities
source "$SCRIPT_DIR/../lib/box.sh"

cd "$PROJECT_DIR"

# Configuration
NETWORK="${NETWORK:-testnet}"
DATA_DIR="./data/${NETWORK}"
CHAIN_ID="${CHAIN_ID:-lvenc-${NETWORK}-1}"
VALIDATOR_POWER="${VALIDATOR_POWER:-1000}"
VALIDATOR_MONIKER="${VALIDATOR_MONIKER:-genesis-validator}"

echo ""
lve_header "Genesis Bootstrap"

echo "Configuration:"
echo "  Network:     $NETWORK"
echo "  Data Dir:    $DATA_DIR"
echo "  Chain ID:    $CHAIN_ID"
echo "  Power:       $VALIDATOR_POWER"
echo "  Moniker:     $VALIDATOR_MONIKER"
echo ""

# Check if fully initialized
if [ -f "$DATA_DIR/genesis.json" ] && [ -f "$DATA_DIR/priv_validator_key.json" ]; then
    msg_warn "Genesis already fully initialized!"
    echo ""
    node dist/node/cli/cli.js genesis show -d "$DATA_DIR" -n "$NETWORK"
    echo ""
    echo "To reinitialize, delete: $DATA_DIR/genesis.json and $DATA_DIR/priv_validator_key.json"
    exit 0
fi

# Build if needed
if [ ! -d "dist" ]; then
    msg_info "Building project..."
    npm run build
fi

# Step 1: Initialize Genesis (skip if exists)
if [ ! -f "$DATA_DIR/genesis.json" ]; then
    msg_info "Step 1/3: Initializing genesis..."
    node dist/node/cli/cli.js genesis init \
        -d "$DATA_DIR" \
        -n "$NETWORK" \
        --chain-id "$CHAIN_ID"
else
    msg_warn "Step 1/3: Genesis already exists, skipping..."
fi

# Step 2: Create Validator Key (skip if exists)
if [ ! -f "$DATA_DIR/priv_validator_key.json" ]; then
    echo ""
    msg_info "Step 2/3: Creating validator key..."
    node dist/node/cli/cli.js validator init \
        -d "$DATA_DIR" \
        -n "$NETWORK"
else
    msg_warn "Step 2/3: Validator key already exists, skipping..."
fi

# Step 3: Add validator to genesis
echo ""
msg_info "Step 3/3: Adding validator to genesis..."
PUBKEY=$(node dist/node/cli/cli.js validator show -d "$DATA_DIR" -n "$NETWORK" --pubkey)
node dist/node/cli/cli.js genesis add-validator \
    -d "$DATA_DIR" \
    -n "$NETWORK" \
    --pubkey "$PUBKEY" \
    --power "$VALIDATOR_POWER" \
    --moniker "$VALIDATOR_MONIKER" || true

echo ""
quick_box "[+] Genesis Bootstrap Complete!" \
    "genesis.json: $DATA_DIR/genesis.json" \
    "validator_key: $DATA_DIR/priv_validator_key.json"
echo ""
msg_warn "IMPORTANT: Backup your priv_validator_key.json!"
echo ""
echo "Next step: ./runners/genesis-bootstrap/start.sh"
echo ""
