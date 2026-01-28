# Genesis Bootstrap Runner

Скрипты для запуска **первого genesis валидатора** на VPS.

## Быстрый старт

```bash
# 1. Инициализация (делается ОДИН раз)
./runners/genesis-bootstrap/init.sh

# 2. Запуск ноды (автоматически с PM2)
./runners/genesis-bootstrap/start.sh
```

## Обновление ноды

```bash
./runners/genesis-bootstrap/update_node.sh
```
Это автоматически:
1. Скачает новый код (git pull)
2. Установит зависимости (npm install)
3. Соберёт проект (npm run build)
4. Перезапустит ноду (pm2 restart)

## Конфигурация через ENV

| Variable | Default | Description |
|----------|---------|-------------|
| `NETWORK` | testnet | Сеть (testnet/mainnet) |
| `CHAIN_ID` | lvenc-testnet-1 | ID чейна |
| `VALIDATOR_POWER` | 1000 | Начальная мощность |
| `VALIDATOR_MONIKER` | genesis-validator | Имя валидатора |
| `API_PORT` | 3001 | Порт API |
| `P2P_PORT` | 6001 | Порт P2P |
| `PM2_NAME` | lve-genesis | Имя в PM2 |

## Команды PM2

```bash
pm2 logs lve-genesis      # Логи
pm2 status                # Статус
pm2 restart lve-genesis   # Перезапуск
pm2 stop lve-genesis      # Остановка
```

## Файлы

После init.sh будут созданы:
- `data/testnet/genesis.json` — конфигурация генезиса
- `data/testnet/priv_validator_key.json` — **ПРИВАТНЫЙ КЛЮЧ** (backup!)
