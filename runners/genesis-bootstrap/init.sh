#!/bin/bash
# =========================================================
# LVE Chain — Genesis Bootstrap Script (v2)
# Uses UnifiedIdentity for single identity + validator key
# =========================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

source "$SCRIPT_DIR/../lib/box.sh"

cd "$PROJECT_DIR"

NETWORK="${NETWORK:-testnet}"
DATA_DIR="./data/${NETWORK}"
CHAIN_ID="${CHAIN_ID:-lvenc-${NETWORK}-1}"
VALIDATOR_POWER="${VALIDATOR_POWER:-1000}"
VALIDATOR_MONIKER="${VALIDATOR_MONIKER:-genesis-validator}"

echo ""
lve_header "Genesis Bootstrap"

echo "  📋 Configuration:"
echo "     Network:  $NETWORK"
echo "     Chain ID: $CHAIN_ID"
echo "     Power:    $VALIDATOR_POWER"
echo "     Moniker:  $VALIDATOR_MONIKER"
echo ""

# Check if fully initialized (new format: node_identity.json)
if [ -f "$DATA_DIR/genesis.json" ] && [ -f "$DATA_DIR/node_identity.json" ]; then
    msg_warn "Genesis already fully initialized!"
    echo ""
    node dist/node/cli/cli.js genesis show -d "$DATA_DIR" -n "$NETWORK"
    echo "  💡 To reinitialize, delete $DATA_DIR"
    exit 0
fi

# Also check old format for migration
if [ -f "$DATA_DIR/genesis.json" ] && [ -f "$DATA_DIR/priv_validator_key.json" ]; then
    msg_warn "Old genesis format detected. Will migrate on next start."
    echo ""
    node dist/node/cli/cli.js genesis show -d "$DATA_DIR" -n "$NETWORK"
    echo "  💡 Run start.sh to auto-migrate to new format"
    exit 0
fi

# Build if needed
if [ ! -d "dist" ]; then
    msg_info "Building project..."
    npm run build
fi

# Step 1: Initialize Genesis
if [ ! -f "$DATA_DIR/genesis.json" ]; then
    msg_info "Step 1/3: Initializing genesis..."
    node dist/node/cli/cli.js genesis init \
        -d "$DATA_DIR" \
        -n "$NETWORK" \
        --chain-id "$CHAIN_ID"
else
    msg_warn "Step 1/3: Genesis already exists, skipping..."
fi

# Step 2: Create Node Identity (new unified format)
# We need to trigger identity creation via a quick start that exits
if [ ! -f "$DATA_DIR/node_identity.json" ]; then
    echo ""
    msg_info "Step 2/3: Creating node identity..."
    
    # Create identity by running identity init command
    # Use dynamic import since this is an ES module
    node --input-type=module -e "
import { initUnifiedIdentity } from './dist/node/identity/index.js';
import { chainParams } from './dist/protocol/params/index.js';

process.env.LVE_NETWORK = '${NETWORK}';
const identity = await initUnifiedIdentity('${DATA_DIR}');
console.log('');
console.log('  ╭────────────────────────────────────────────────────────╮');
console.log('  │  🔑 Node Identity Created                              │');
console.log('  ├────────────────────────────────────────────────────────┤');
console.log('  │  Address:  ' + identity.getFullAddress().padEnd(45) + '│');
console.log('  │  PubKey:   ' + (identity.getPubKey().slice(0, 40) + '...').padEnd(45) + '│');
console.log('  ╰────────────────────────────────────────────────────────╯');
console.log('');
"
else
    msg_warn "Step 2/3: Node identity already exists, skipping..."
fi

# Step 3: Add validator to genesis
echo ""
msg_info "Step 3/3: Adding validator to genesis..."

# Get pubkey from node_identity.json
if command -v jq &> /dev/null; then
    PUBKEY=$(jq -r '.pub_key.value' "$DATA_DIR/node_identity.json")
else
    # Fallback to grep/sed if jq not installed
    PUBKEY=$(grep -o '"value": "[^"]*"' "$DATA_DIR/node_identity.json" | head -1 | sed 's/.*: "//;s/"$//')
fi

node dist/node/cli/cli.js genesis add-validator \
    -d "$DATA_DIR" \
    -n "$NETWORK" \
    --pubkey "$PUBKEY" \
    --power "$VALIDATOR_POWER" \
    --moniker "$VALIDATOR_MONIKER" || true

echo ""
quick_box "✅ Genesis Bootstrap Complete!" \
    "genesis.json: $DATA_DIR/genesis.json" \
    "node_identity: $DATA_DIR/node_identity.json"
echo ""
msg_warn "IMPORTANT: Backup your node_identity.json!"
msg_warn "          It contains your validator private key!"
echo ""
echo "  ➜ Next: ./runners/genesis-bootstrap/start.sh"
echo ""
