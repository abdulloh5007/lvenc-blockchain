# LVE Chain Node Runners

Preconfigured runners for different node roles.

## Structure

```
runners/
├── full/           # Full node (P2P, pool, governance)
├── validator/      # Validator node (block production, staking)
├── rpc/            # RPC node (API server, read-only)
└── light/          # Light node (headers-only sync)
```

## Usage

```bash
# Full Node
./runners/full/start.sh

# Validator Node
./runners/validator/start.sh

# RPC Node
./runners/rpc/start.sh

# Light Node
./runners/light/start.sh
```

## Configuration

Each runner has its own `config.json` with:
- `role` - Node role
- `network` - testnet/mainnet
- `p2p.port` - P2P port
- `api.port` - API port (RPC only)
- `dataDir` - Data directory

## Ports

| Role | P2P Port | API Port |
|------|----------|----------|
| full | 6001 | - |
| validator | 6002 | - |
| rpc | 6003 | 3001 |
| light | 6004 | - |
