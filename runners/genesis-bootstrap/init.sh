#!/bin/bash
# =========================================================
# LVE Chain — Genesis Bootstrap Script
# =========================================================
# This script initializes the FIRST genesis validator node.
# Run this ONCE on your VPS before starting the node.
# =========================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        LVE Chain — Genesis Bootstrap Initialization       ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Configuration
NETWORK="${NETWORK:-testnet}"
DATA_DIR="./data/${NETWORK}"
CHAIN_ID="${CHAIN_ID:-lvenc-${NETWORK}-1}"
VALIDATOR_POWER="${VALIDATOR_POWER:-1000}"
VALIDATOR_MONIKER="${VALIDATOR_MONIKER:-genesis-validator}"
INITIAL_SUPPLY="${INITIAL_SUPPLY:-1000000}"

echo -e "${YELLOW}Configuration:${NC}"
echo "  Network:     $NETWORK"
echo "  Data Dir:    $DATA_DIR"
echo "  Chain ID:    $CHAIN_ID"
echo "  Power:       $VALIDATOR_POWER"
echo "  Moniker:     $VALIDATOR_MONIKER"
echo ""

# Check if fully initialized
if [ -f "$DATA_DIR/genesis.json" ] && [ -f "$DATA_DIR/priv_validator_key.json" ]; then
    echo -e "${YELLOW}⚠️  Genesis already fully initialized!${NC}"
    echo ""
    node dist/node/cli/cli.js genesis show -d "$DATA_DIR" -n "$NETWORK"
    echo ""
    echo "To reinitialize, delete: $DATA_DIR/genesis.json and $DATA_DIR/priv_validator_key.json"
    exit 0
fi

# Build if needed
if [ ! -d "dist" ]; then
    echo -e "${YELLOW}📦 Building project...${NC}"
    npm run build
fi

# Step 1: Initialize Genesis (skip if exists)
if [ ! -f "$DATA_DIR/genesis.json" ]; then
    echo -e "${GREEN}Step 1/3: Initializing genesis...${NC}"
    node dist/node/cli/cli.js genesis init \
        -d "$DATA_DIR" \
        -n "$NETWORK" \
        --chain-id "$CHAIN_ID"
else
    echo -e "${YELLOW}Step 1/3: Genesis already exists, skipping...${NC}"
fi

# Step 2: Create Validator Key (skip if exists)
if [ ! -f "$DATA_DIR/priv_validator_key.json" ]; then
    echo ""
    echo -e "${GREEN}Step 2/3: Creating validator key...${NC}"
    node dist/node/cli/cli.js validator init \
        -d "$DATA_DIR" \
        -n "$NETWORK"
else
    echo -e "${YELLOW}Step 2/3: Validator key already exists, skipping...${NC}"
fi

# Get the public key
PUBKEY=$(node dist/node/cli/cli.js validator show -d "$DATA_DIR" -n "$NETWORK" --pubkey)
echo ""
echo -e "  Validator PubKey: ${BLUE}${PUBKEY:0:32}...${NC}"

# Step 3: Add validator to genesis (check if already added)
VALIDATORS=$(node dist/node/cli/cli.js genesis show -d "$DATA_DIR" -n "$NETWORK" 2>&1 | grep -c "Validators:" || true)
echo ""
echo -e "${GREEN}Step 3/3: Adding validator to genesis...${NC}"
node dist/node/cli/cli.js genesis add-validator \
    -d "$DATA_DIR" \
    -n "$NETWORK" \
    --pubkey "$PUBKEY" \
    --power "$VALIDATOR_POWER" \
    --moniker "$VALIDATOR_MONIKER" || true

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                ✅ Genesis Bootstrap Complete!              ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Files created:${NC}"
echo "  📜 $DATA_DIR/genesis.json"
echo "  🔐 $DATA_DIR/priv_validator_key.json"
echo ""
echo -e "${YELLOW}Next step:${NC}"
echo "  Run: ./runners/genesis-bootstrap/start.sh"
echo ""
echo -e "${RED}⚠️  IMPORTANT: Backup your priv_validator_key.json!${NC}"
echo ""
