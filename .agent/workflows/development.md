---
description: How to work on LVE Chain blockchain project - user preferences and rules
---

# LVE Chain Development Workflow

## 🚨 ОБЯЗАТЕЛЬНО ПРОЧИТАЙ ПЕРЕД РАБОТОЙ

### Правила пользователя:

1. **СНАЧАЛА ПЛАН** - покажи что будешь делать ПЕРЕД изменениями
2. **МАЛЕНЬКИЕ ШАГИ** - одно изменение → build → test → commit
3. **ПРОВЕРЯЙ БИЛД** - `npm run build` после КАЖДОГО изменения
4. **НЕ ИГРАЙ НА НЕРВАХ** - спрашивай если не уверен

### Перед началом ОБЯЗАТЕЛЬНО:
// turbo
```bash
npm run build
```

// turbo
```bash
git status
```

### После каждого изменения:
// turbo
```bash
npm run build 2>&1 | tail -15
```

### Коммит изменений:
```bash
git add -A && git commit -m "тип(область): описание" && git push
```

## Структура проекта

```
src/
├── node/api/routes/    # API endpoints
├── protocol/blockchain/ # Blockchain core
├── runtime/staking/    # Staking/Validators
├── runtime/pool/       # AMM Pool (существует!)
└── network/            # P2P сеть

frontend/src/pages/     # React страницы
```

## Важные файлы

- `src/node/config.ts` - конфигурация
- `src/runtime/staking/StakingPool.ts` - стейкинг
- `src/runtime/staking/BlockProducer.ts` - создание блоков
- `src/runtime/pool/LiquidityPool.ts` - AMM пул

## Transaction Types
```typescript
type TransactionType = 
  | 'TRANSFER' 
  | 'STAKE' | 'UNSTAKE' 
  | 'DELEGATE' | 'UNDELEGATE' 
  | 'COMMISSION'
  | 'SWAP'
  | 'ADD_LIQUIDITY' | 'REMOVE_LIQUIDITY';
```

## Конфигурация staking (недавно добавлено)
```typescript
staking: {
    minValidatorStake: 100,
    maxConcentration: 33,  // Max 33% на валидатора
    minCommission: 0,
    maxCommission: 30,
}
```

## Репозиторий
https://github.com/abdulloh5007/lvenc-blockchain
