#!/bin/bash
# Light Node Runner
# Headers-only sync, minimal resource usage.

cd "$(dirname "$0")/../.."

echo "💡 Starting Light Node..."
node dist/cli/cli.js start \
  --role light \
  --network testnet \
  --p2p 6004 \
  --data ./runners/light/data
