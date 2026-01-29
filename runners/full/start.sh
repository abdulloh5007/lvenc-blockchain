#!/bin/bash
# Full Node Runner
# Participates in P2P, pool/AMM, governance. No API, no block production.

cd "$(dirname "$0")/../.."

echo "🚀 Starting Full Node..."
node dist/node/cli/cli.js start \
  --role full \
  --network testnet \
  --p2p 6001 \
  --data ./data/testnet
