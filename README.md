# EDU Chain Node

Educational Blockchain Network with Proof-of-Stake consensus.

## 🚀 Quick Start (One Line!)

### Testnet
```bash
./run_testnet.sh
```

### Mainnet
```bash
./run_mainnet.sh
```

---

## 📦 Installation

### Option 1: From Source (Recommended)

```bash
# Clone the repository
git clone https://github.com/abdulloh5007/lvenc-blockchain.git
cd lvenc-blockchain

# Install dependencies
npm install

# Build
npm run build

# Start testnet node
./run_testnet.sh
```

### Option 2: Manual Start

```bash
# Testnet
npx edu-chain start --network testnet

# Mainnet
npx edu-chain start --network mainnet
```

### Option 3: Docker

```bash
# Build the image
docker build -t edu-chain-node .

# Run the node
docker run -d -p 3001:3001 -p 6001:6001 edu-chain-node
```

## 📖 Commands

### Start Node

```bash
edu-chain start [options]
```

**Options:**
- `-p, --port <number>` - API server port (default: 3001)
- `--p2p <number>` - P2P server port (default: 6001)
- `-s, --seed <url>` - Seed node URL to connect to
- `-d, --data <path>` - Data directory path (default: ./data)
- `-n, --network <name>` - Network name: mainnet/testnet (default: mainnet)
- `--no-api` - Run without API server (P2P only)
- `-b, --bootstrap` - Run as bootstrap node (peer discovery only)
- `--api-only` - Run API server only (no P2P participation)

### Node Modes

| Mode | Command | Description |
|------|---------|-------------|
| **Full Node** | `edu-chain start` | Full participant: sync, validate, stake, produce blocks |
| **Bootstrap** | `edu-chain start --bootstrap` | Peer discovery only, no blocks |
| **API-Only** | `edu-chain start --api-only` | Read-only API, no P2P |

**Examples:**

```bash
# Start with default settings
edu-chain start

# Start on custom ports
edu-chain start --port 3005 --p2p 6005

# Connect to a specific seed node
edu-chain start --seed ws://seed.educhain.io:6001

# Run as testnet node
edu-chain start --network testnet
```

### Check Status

```bash
edu-chain status
```

### Show Connected Peers

```bash
edu-chain peers
```

## 🌐 Running Multiple Nodes

Use Docker Compose to run a local network of 3 nodes:

```bash
docker-compose up -d
```

This will start:
- **Node 1**: API on port 3001, P2P on port 6001
- **Node 2**: API on port 3002, P2P on port 6002
- **Node 3**: API on port 3003, P2P on port 6003

## 💰 Staking

To become a validator and earn block rewards:

1. Create a wallet
2. Get some EDU tokens
3. Stake at least 100 EDU

```bash
# Check staking API
curl http://localhost:3001/api/staking
```

## 📚 API Documentation

Once the node is running, visit:
- **Swagger UI**: http://localhost:3001/docs
- **Health Check**: http://localhost:3001/health

## 📁 Data Directory Structure

```
data/
├── mainnet/
│   ├── blockchain.json
│   └── staking.json
└── testnet/
    ├── blockchain.json
    └── staking.json
```

## ⚙️ Configuration

Create a `.env` file in the project root:

```env
API_PORT=3001
P2P_PORT=6001
NETWORK=mainnet
DATA_DIR=./data
```

## 🔧 System Requirements

- **Node.js**: v18 or higher
- **RAM**: 512MB minimum
- **Storage**: 1GB for blockchain data
- **Network**: Stable internet connection

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

## 📄 License

MIT License
