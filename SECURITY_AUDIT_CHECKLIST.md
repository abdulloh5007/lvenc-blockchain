# Security Audit Checklist

## Transaction Security
- [ ] Double-spending prevented via getAvailableBalance
- [ ] Reentrancy blocked via acquireTxLock/releaseTxLock
- [ ] Integer overflow protected via SafeMath
- [ ] Front-running mitigated via commit-reveal
- [ ] Role-based access control implemented

## Consensus Security
- [ ] 51% attack mitigated via checkpoints
- [ ] Sybil attack detected via peer reputation
- [ ] Eclipse attack prevented via diverse peers
- [ ] Block timestamps validated

## Cryptographic Security
- [ ] Secure random using crypto.randomBytes
- [ ] Nonce reuse prevented via tracking
- [ ] Signature malleability fixed via normalization
- [ ] Keys encrypted at rest

## Wallet Security
- [ ] Phishing domains detected
- [ ] Clipboard hijacking detected
- [ ] Seed phrase exposure prevented
- [ ] Address blacklist functional

## NFT Security
- [ ] Metadata immutable after mint
- [ ] Approval limits enforced (max 100)
- [ ] Royalties enforced on transfer
- [ ] Dusting attacks filtered

## Infrastructure Security
- [ ] RPC method rate limiting active
- [ ] API key abuse monitoring
- [ ] Node health tracking
- [ ] Environment secrets redacted in logs

## API Security
- [ ] SQL/NoSQL injection blocked
- [ ] XSS headers set
- [ ] CSRF tokens validated
- [ ] Brute force protection active
- [ ] CORS configured correctly

## Tests
- [ ] Run: npx vitest tests/security/
- [ ] Run: npx ts-node tests/security/attack-double-spend.ts
- [ ] Run: npx ts-node tests/security/attack-reentrancy.ts
