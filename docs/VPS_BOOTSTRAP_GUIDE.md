# Bootstrap Node: Пошаговый запуск с нуля

## Шаг 0: Подготовка на VPS

```bash
# SSH на VPS
ssh user@your-vps-ip

# Убедиться что Node.js 18+ установлен
node --version

# Если нет, установить:
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

---

## Шаг 1: Удалить старые nginx конфиги

```bash
# Посмотреть текущие конфиги
ls -la /etc/nginx/sites-enabled/

# Удалить старые (если есть)
sudo rm /etc/nginx/sites-enabled/api.lvenc.site 2>/dev/null
sudo rm /etc/nginx/sites-enabled/seed1.lvenc.site 2>/dev/null
sudo rm /etc/nginx/sites-available/api.lvenc.site 2>/dev/null
sudo rm /etc/nginx/sites-available/seed1.lvenc.site 2>/dev/null

# Проверить nginx
sudo nginx -t
sudo systemctl reload nginx
```

---

## Шаг 2: Клонировать и собрать проект

```bash
# Перейти в домашнюю директорию
cd ~

# Удалить старую версию (если есть)
rm -rf my-blockchain

# Клонировать
git clone https://github.com/YOUR_REPO/my-blockchain.git
cd my-blockchain

# Установить зависимости
npm install

# Собрать
npm run build
```

---

## Шаг 3: Настроить данные

```bash
# Создать data директорию для RPC ноды
mkdir -p runners/rpc/data

# Удалить старые данные (если нужен чистый старт)
rm -rf data/
rm -rf runners/*/data/
mkdir -p runners/rpc/data
```

---

## Шаг 4: Создать nginx конфиг для API

```bash
# Создать конфиг
sudo nano /etc/nginx/sites-available/api.lvenc.site
```

**Вставить:**
```nginx
server {
    listen 443 ssl http2;
    server_name api.lvenc.site;

    ssl_certificate /etc/letsencrypt/live/api.lvenc.site/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.lvenc.site/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name api.lvenc.site;
    return 301 https://$host$request_uri;
}
```

```bash
# Активировать
sudo ln -s /etc/nginx/sites-available/api.lvenc.site /etc/nginx/sites-enabled/

# Проверить и перезагрузить
sudo nginx -t
sudo systemctl reload nginx
```

---

## Шаг 5: Настроить firewall

```bash
# Открыть порты
sudo ufw allow 443/tcp   # HTTPS для API
sudo ufw allow 6001/tcp  # P2P для seed node

# Проверить
sudo ufw status
```

---

## Шаг 6: Запустить RPC ноду (тест)

```bash
cd ~/my-blockchain

# Тестовый запуск (в foreground)
node dist/cli/cli.js start \
  --role rpc \
  --network testnet \
  --port 3001 \
  --p2p 6001 \
  --data ./runners/rpc/data
```

**Ожидаемый вывод:**
```
╔═══════════════════════════════════════════════════════════╗
║  ██╗    ██╗   ██╗███████╗███╗   ██╗ ██████╗               ║
║  ...                                                       ║
║  LVE CHAIN Node [RPC] v1.2.0                              ║
╚═══════════════════════════════════════════════════════════╝

✅ Node is running!
```

**Ctrl+C чтобы остановить тест**

---

## Шаг 7: Проверить API

```bash
# В другом терминале или после Ctrl+C
curl http://localhost:3001/health

# Или через nginx (если сертификат уже есть)
curl https://api.lvenc.site/health
```

---

## Шаг 8: Создать systemd service (для постоянной работы)

```bash
sudo nano /etc/systemd/system/lve-rpc.service
```

**Вставить:**
```ini
[Unit]
Description=LVE Chain RPC Node
After=network.target

[Service]
Type=simple
User=YOUR_USERNAME
WorkingDirectory=/home/YOUR_USERNAME/my-blockchain
ExecStart=/usr/bin/node dist/cli/cli.js start --role rpc --network testnet --port 3001 --p2p 6001 --data ./runners/rpc/data
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
# Заменить YOUR_USERNAME на реального пользователя
sudo sed -i 's/YOUR_USERNAME/abdulloh/g' /etc/systemd/system/lve-rpc.service

# Активировать и запустить
sudo systemctl daemon-reload
sudo systemctl enable lve-rpc
sudo systemctl start lve-rpc

# Проверить статус
sudo systemctl status lve-rpc
```

---

## Шаг 9: Проверить всё работает

```bash
# Логи ноды
sudo journalctl -u lve-rpc -f

# API через HTTPS
curl https://api.lvenc.site/health

# P2P доступность (с другой машины)
# ws://seed1.lvenc.site:6001
```

---

## Итог

| Сервис | URL | Порт |
|--------|-----|------|
| API | https://api.lvenc.site | 443 → 3001 |
| P2P Seed | ws://seed1.lvenc.site:6001 | 6001 |

Другие ноды могут подключаться:
```bash
node dist/cli/cli.js start --role full --seed ws://seed1.lvenc.site:6001
```
