# PoS Blockchain — Implementation Plan (TON-like)

## Status
**Normative / Binding Specification**

This document is the authoritative implementation plan for the PoS blockchain.
All implementations MUST follow this document and the linked economic specification.
Any deviation is considered a protocol bug.

---

## 0. Purpose

This document defines:
- core architectural decisions of the PoS blockchain;
- the TON-like economic model with infinite supply;
- clear module responsibilities;
- previously fixed and removed legacy logic;
- a deterministic and safe implementation order.

This is **not** a marketing or discussion document.

---

## 1. Requirements

### 1.1 Functional Requirements
- Consensus: **Pure Proof-of-Stake**
- Supply Model: **Infinite supply**
- Security: **Stake-based + slashing**
- Economics: **Inflation + transaction fees**
- Time Model: **Epoch-based**

### 1.2 Non-Functional Requirements
- Deterministic inflation
- Protection against double-mint
- Node restart must not affect supply
- Formally verifiable economics

---

## 2. Fixed Design Decisions

### 2.1 Supply Model
- ❌ No max supply
- ❌ No halving
- ❌ No difficulty
- ✅ Supply is observable, not enforced
- ✅ Minting is protocol-controlled only

**Rationale:**  
PoS requires a permanent reward mechanism to sustain long-term security.

---

### 2.2 Consensus
- Pure PoS only
- No PoW fallback
- No hybrid modes

---

### 2.3 Economic Model
- TON-like PoS economy
- Low, controlled inflation
- Inflation adapts to stake ratio

---

## 3. Explicitly Removed Legacy Logic

The following elements are **forbidden** in the codebase:

- `difficulty`
- `hashrate`
- `halvingInterval`
- `blockRewardFixed`
- `maxSupplyChecks`

**Rationale:**  
These belong to PoW or capped-supply systems and break PoS economics.

---

## 4. Economic Specification (Normative)

### 4.1 Source of Truth
Economic logic is **not fully defined here**.

**Normative reference:**  
`pos_economic_spec_v1.json`

This JSON:
- is mandatory;
- has priority over implementation details;
- any mismatch is a protocol violation.

---

### 4.2 Definitions
- `total_supply` — total number of tokens
- `bonded_supply` — tokens currently staked
- `stake_ratio = bonded_supply / total_supply`

---

### 4.3 Inflation Rules
- Inflation is defined **yearly**
- Applied **only at epoch boundaries**
- Minting outside epoch finalization is forbidden

---

### 4.4 Reward Distribution
- Validators
- Delegators
- Treasury (if enabled)

Validator commission:
- configurable
- bounded by the economic spec

---

## 5. Epoch as the Economic Boundary

### 5.1 Core Rule
> **Minting is allowed ONLY during epoch finalization**

Forbidden:
- minting inside blocks
- minting on node restart
- minting during reorgs

---

### 5.2 Epoch Responsibilities
- calculate inflation
- mint new tokens
- distribute rewards
- update supply state

---

## 6. Supply Manager

### 6.1 Responsibilities
- track total supply
- publish statistics
- provide audit data

### 6.2 Explicit Restrictions
- ❌ must not cap supply
- ❌ must not initiate minting

---

## 7. Economic Invariants (MUST HOLD)

The following must always be true:

1. Inflation occurs at most once per epoch  
2. Minted supply equals total distributed rewards  
3. Supply never decreases without burn logic  
4. Node restart does not trigger minting  
5. Economic outcomes are deterministic  

---

## 8. Verification & Testing

### 8.1 Mandatory Tests
- single-epoch inflation test
- full-year inflation simulation
- stake ratio adjustment response
- node restart safety test
- overflow and precision tests

---

## 9. Implementation Order

1. Epoch framework  
2. Staking and bonded supply tracking  
3. Inflation math (from JSON spec)  
4. Reward distribution logic  
5. Supply accounting  
6. Economic invariant tests  

---

## 10. Document Governance

- Changes require a version bump
- Every change must be:
  - justified
  - documented
  - reflected in the economic spec

---

## 11. Conclusion

This plan:
- fixes all previously identified errors;
- removes ambiguity;
- is safe for testnet launch;
- scales cleanly to mainnet.

---
