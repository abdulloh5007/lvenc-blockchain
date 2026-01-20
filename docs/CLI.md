# LVE Chain CLI Reference v2.0.0

Полное руководство по командам LVE Chain Node.

## Быстрый старт

```bash
# Запустить ноду с ролью
lve-chain start --role rpc --network testnet

# Посмотреть identity
lve-chain identity

# Привязать reward address
lve-chain reward generate
```

---

## Команды

### `lve-chain start`

Запуск ноды с указанием роли.

```bash
lve-chain start [options]
```

| Опция | Описание | По умолчанию |
|-------|----------|--------------|
| `-r, --role <role>` | Роль ноды (full/validator/rpc/light) | - |
| `-n, --network <name>` | Сеть (mainnet/testnet) | `mainnet` |
| `-p, --port <number>` | API порт | `3001` |
| `--p2p <number>` | P2P порт | `6001` |
| `-d, --data <path>` | Папка данных | `./data` |
| `-s, --seed <url>` | Seed нода для подключения | - |
| `--no-api` | Запуск без API сервера | - |
| `-b, --bootstrap` | Режим bootstrap ноды | - |

**Роли:**

| Роль | P2P | API | Block Prod | Staking |
|------|-----|-----|------------|---------|
| `full` | ✅ | ❌ | ❌ | ❌ |
| `validator` | ✅ | ❌ | ✅ | ✅ |
| `rpc` | ✅ | ✅ | ❌ | ❌ |
| `light` | headers | ❌ | ❌ | ❌ |

**Примеры:**
```bash
# RPC нода с API
lve-chain start --role rpc --network testnet

# Full node подключённая к seed
lve-chain start --role full --seed wss://seed1.lvenc.site

# Validator с кастомными портами
lve-chain start --role validator -p 4001 --p2p 7001
```

---

### `lve-chain identity`

Показать криптографическую identity ноды.

```bash
lve-chain identity [options]
```

| Опция | Описание |
|-------|----------|
| `-d, --data-dir <path>` | Папка данных |
| `--export` | Экспорт в JSON формате |

---

### `lve-chain reward`

Управление reward address для получения наград валидатора.

#### `reward show`
```bash
lve-chain reward show
```

#### `reward bind <address>`
```bash
lve-chain reward bind tLVE_your_wallet_address
```

#### `reward generate`
```bash
lve-chain reward generate
```

**⚠️ Важно:** Мнемоник показывается только один раз!

---

### `lve-chain status`

Показать статус работающей ноды.

```bash
lve-chain status [-p <port>]
```

---

### `lve-chain peers`

Показать подключённых пиров.

```bash
lve-chain peers [-p <port>]
```

---

## Runners (Предустановленные запуски)

```bash
# RPC node с API
./runners/rpc/start.sh

# Full node
./runners/full/start.sh

# Validator node
./runners/validator/start.sh

# Light node
./runners/light/start.sh
```

---

## Файлы данных

| Файл | Описание |
|------|----------|
| `data/<network>/identity.key` | Криптографическая identity (Ed25519) |
| `data/<network>/blocks.json` | Данные блокчейна |
| `data/<network>/staking.json` | Данные стейкинга |

**⚠️ Важно:** `identity.key` содержит приватный ключ. Никогда не делитесь им!

---

## Ссылки

- [VPS Bootstrap Guide](./VPS_BOOTSTRAP_GUIDE.md)
- [Runners README](../runners/README.md)
