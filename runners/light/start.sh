#!/bin/bash
# Light Node Runner
# Headers-only sync, minimal resource usage.

cd "$(dirname "$0")/../.."

echo "💡 Starting Light Node..."
node dist/node/cli/cli.js start \
  --role light \
  --network testnet \
  --p2p 6004 \
  --data ./data
