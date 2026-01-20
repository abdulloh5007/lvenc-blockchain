#!/bin/bash
# RPC Node Runner
# API server for external queries, read-only state access.

cd "$(dirname "$0")/../.."

echo "🌐 Starting RPC Node..."
node dist/cli/cli.js start \
  --role rpc \
  --network testnet \
  --p2p 6003 \
  --port 3001 \
  --data ./runners/rpc/data
