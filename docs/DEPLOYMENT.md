<![CDATA[# AgentsCan Cloud API — Deployment Guide

## Table of Contents

- [Docker Deployment](#docker-deployment)
- [Railway Deployment](#railway-deployment)
- [Fly.io Deployment](#flyio-deployment)
- [VPS Deployment (Ubuntu)](#vps-deployment-ubuntu)
- [Environment Variables](#environment-variables)
- [SSL/TLS Setup](#ssltls-setup)
- [Production Checklist](#production-checklist)

---

## Docker Deployment

### docker-compose.yml

```yaml
version: "3.8"

services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://agentscan:agentscan@db:5432/agentscan
      PORT: "3000"
      HOST: "0.0.0.0"
      STORAGE_PATH: /data/storage
      BASE_URL: https://your-domain.com
      ADMIN_SECRET: ${ADMIN_SECRET}
      CLEANUP_INTERVAL_MS: "60000"
      DEFAULT_EXPIRES_IN: "3600"
      RESULT_TTL_MS: "86400000"
    volumes:
      - storage-data:/data/storage
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: agentscan
      POSTGRES_PASSWORD: agentscan
      POSTGRES_DB: agentscan
    volumes:
      - pg-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U agentscan"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  pg-data:
  storage-data:
```

### Dockerfile

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY drizzle.config.ts ./

RUN mkdir -p /data/storage

EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### Deploy

```bash
# Build and start
docker compose up -d

# Push schema
docker compose exec api npx drizzle-kit push

# Seed a test key
docker compose exec api node dist/seed.js

# View logs
docker compose logs -f api
```

---

## Railway Deployment

1. **Create a new project** on [railway.app](https://railway.app)

2. **Add PostgreSQL:**
   - Click "New" → "Database" → "PostgreSQL"
   - Railway provides `DATABASE_URL` automatically

3. **Deploy from GitHub:**
   - Click "New" → "GitHub Repo" → Select `agentscan-api`
   - Railway auto-detects Node.js

4. **Set environment variables:**
   - `DATABASE_URL` → auto-linked from PostgreSQL service
   - `PORT` → `3000`
   - `HOST` → `0.0.0.0`
   - `BASE_URL` → `https://your-app.up.railway.app`
   - `ADMIN_SECRET` → generate a strong secret
   - `STORAGE_PATH` → `/data/storage`

5. **Add a volume** for persistent storage:
   - Mount path: `/data/storage`

6. **Push schema:**
   ```bash
   railway run npx drizzle-kit push
   ```

7. **Seed:**
   ```bash
   railway run npm run seed
   ```

---

## Fly.io Deployment

### fly.toml

```toml
app = "agentscan-api"
primary_region = "iad"

[build]

[env]
  PORT = "3000"
  HOST = "0.0.0.0"
  STORAGE_PATH = "/data/storage"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = false
  auto_start_machines = true
  min_machines_running = 1

[mounts]
  source = "storage_data"
  destination = "/data/storage"
```

### Deploy

```bash
# Create the app
fly launch

# Create PostgreSQL
fly postgres create --name agentscan-db
fly postgres attach agentscan-db

# Set secrets
fly secrets set ADMIN_SECRET="your-strong-secret"
fly secrets set BASE_URL="https://agentscan-api.fly.dev"

# Create volume for storage
fly volumes create storage_data --size 1 --region iad

# Deploy
fly deploy

# Push schema
fly ssh console -C "npx drizzle-kit push"

# Seed
fly ssh console -C "node dist/seed.js"
```

---

## VPS Deployment (Ubuntu)

### 1. Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Create database
sudo -u postgres createuser agentscan
sudo -u postgres createdb agentscan -O agentscan
sudo -u postgres psql -c "ALTER USER agentscan PASSWORD 'your-strong-password';"
```

### 2. Deploy the Application

```bash
# Clone
cd /opt
sudo git clone https://github.com/Ammarplays/agentscan-api.git
cd agentscan-api

# Install & build
sudo npm ci
sudo npm run build

# Create storage directory
sudo mkdir -p /var/lib/agentscan/storage
sudo chown $USER:$USER /var/lib/agentscan/storage

# Configure
sudo cp .env.example .env
sudo nano .env
# Set:
#   DATABASE_URL=postgresql://agentscan:your-strong-password@localhost:5432/agentscan
#   STORAGE_PATH=/var/lib/agentscan/storage
#   BASE_URL=https://your-domain.com
#   ADMIN_SECRET=your-strong-secret

# Push schema & seed
npx drizzle-kit push
npm run seed
```

### 3. Systemd Service

```ini
# /etc/systemd/system/agentscan-api.service
[Unit]
Description=AgentsCan Cloud API
After=network.target postgresql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/agentscan-api
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production
EnvironmentFile=/opt/agentscan-api/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable agentscan-api
sudo systemctl start agentscan-api
sudo systemctl status agentscan-api
```

### 4. Nginx Reverse Proxy

```nginx
# /etc/nginx/sites-available/agentscan
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 50M;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/agentscan /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `PORT` | ❌ | `3000` | Server port |
| `HOST` | ❌ | `0.0.0.0` | Server bind address |
| `STORAGE_PATH` | ❌ | `./storage` | PDF storage directory |
| `BASE_URL` | ✅ | `http://localhost:3000` | Public URL (used in webhooks/results) |
| `ADMIN_SECRET` | ✅ | — | Admin auth secret |
| `CLEANUP_INTERVAL_MS` | ❌ | `60000` | Cleanup job interval (ms) |
| `DEFAULT_EXPIRES_IN` | ❌ | `3600` | Default request expiry (seconds) |
| `RESULT_TTL_MS` | ❌ | `86400000` | Result retention time (ms, default 24h) |

---

## SSL/TLS Setup

### With Certbot (Let's Encrypt)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
sudo certbot renew --dry-run  # Test auto-renewal
```

### With Cloudflare

1. Add your domain to Cloudflare
2. Set SSL/TLS to "Full (Strict)"
3. Point DNS to your server IP (orange cloud = proxied)

---

## Production Checklist

- [ ] **Set a strong `ADMIN_SECRET`** (32+ random characters)
- [ ] **Set `BASE_URL`** to your public HTTPS URL
- [ ] **Enable SSL/TLS** (Let's Encrypt or Cloudflare)
- [ ] **Use a strong PostgreSQL password**
- [ ] **Set up database backups** (pg_dump cron job)
- [ ] **Mount persistent storage** for PDF files
- [ ] **Set up monitoring** (uptime checks on `/health`)
- [ ] **Set up log rotation** (journald or logrotate)
- [ ] **Configure firewall** (only expose ports 80/443)
- [ ] **Set `NODE_ENV=production`**
- [ ] **Review rate limiting** (default: 100 req/min per API key)
- [ ] **Set up CORS** if needed for browser-based clients
- [ ] **Test webhook delivery** end-to-end
- [ ] **Monitor disk usage** for PDF storage
]]>