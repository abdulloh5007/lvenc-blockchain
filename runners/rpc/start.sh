#!/bin/bash
# RPC Node Runner
# API server for external queries, read-only state access.
# If this node IS a bootstrap (e.g. seed1.lvenc.site), add --self-url to prevent self-connection

cd "$(dirname "$0")/../.."

echo "🌐 Starting RPC Node..."
node dist/node/cli/cli.js start \
  --role rpc \
  --network testnet \
  --p2p 6003 \
  --port 3001 \
  --data ./data/testnet \
  --self-url wss://seed1.lvenc.site
