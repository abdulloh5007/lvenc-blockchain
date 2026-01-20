# LVE Wallet Architecture

## Overview

LVE Chain is an **independent L1 blockchain** with its own address format, not EVM-compatible.

---

## Key Derivation (BIP-44 Standard)

| Component | Standard |
|-----------|----------|
| Mnemonic | BIP-39 (12 or 24 words) |
| Derivation Path | `m/44'/60'/0'/0/0` |
| Private Key | Standard secp256k1 |

**The mnemonic and private key are compatible with standard wallets (MetaMask, Trust Wallet, etc.).**

---

## Address Format (LVE-Specific)

| Component | Format |
|-----------|--------|
| Algorithm | `sha256(publicKey)[0..40]` |
| Prefix | `tLVE` (testnet) / `LVE` (mainnet) |
| Length | 44 characters (4 prefix + 40 hex) |

**Example:**
```
tLVE00d0ccd9d689d870bf16e565274f565af4ca6c91
```

⚠️ **LVE addresses differ from Ethereum addresses!**

The same mnemonic produces:
- LVE Address: `tLVE00d0ccd9d689d...`
- ETH Address: `0x0a3d21c3c7b894...` (different because Ethereum uses keccak256)

---

## Wallet Import Behavior

When importing a LVE mnemonic into MetaMask:
1. ✅ Private key is correct
2. ❌ Address shown differs (Ethereum format)
3. ✅ Can still sign transactions for LVE via custom RPC

**For LVE transactions, use the LVE address shown in `lve-chain identity`.**

---

## Commands

```bash
# Generate new wallet
lve-chain reward generate

# Show current identity and reward address
lve-chain identity

# Bind existing address
lve-chain reward bind <address>
```

---

## Security Notes

- Store mnemonic securely (24 words)
- Never share your private key
- Reward address receives validator earnings
