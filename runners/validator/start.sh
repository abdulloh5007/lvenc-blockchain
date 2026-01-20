#!/bin/bash
# Validator Node Runner
# Block production, staking, full network participation.

cd "$(dirname "$0")/../.."

echo "⛏️ Starting Validator Node..."
node dist/node/cli/cli.js start \
  --role validator \
  --network testnet \
  --p2p 6002 \
  --data ./data
