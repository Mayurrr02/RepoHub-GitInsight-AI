# RepoHub Production Deployment Guide

This guide covers deploying RepoHub to production environments using Docker Compose, Nginx, and cloud providers.

---

## 1. Prerequisites

- Linux Server (Ubuntu 22.04 LTS or 24.04 LTS recommended)
- Docker Engine 24+ and Docker Compose v2.20+
- Domain name with DNS A/AAAA records pointing to server IP
- GitHub OAuth Application configured with callback URL: `https://your-domain.com/api/v1/auth/github/callback`

---

## 2. Environment Configuration

Create a production `.env` file in the root directory:

```env
# Database Credentials
POSTGRES_DB=repohub
POSTGRES_USER=repohub_admin
POSTGRES_PASSWORD=GENERATE_STRONG_SECRET_PASSWORD
DATABASE_URL=postgresql+psycopg://repohub_admin:GENERATE_STRONG_SECRET_PASSWORD@postgres:5432/repohub

# Redis Cache & Broker
REDIS_URL=redis://redis:6379/0

# Security & JWT
JWT_SECRET_KEY=GENERATE_RANDOM_64_CHAR_HEX_KEY
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=15
JWT_REFRESH_TOKEN_EXPIRE_DAYS=30

# GitHub OAuth
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_REDIRECT_URI=https://your-domain.com/api/v1/auth/github/callback

# Domain & URLs
FRONTEND_URL=https://your-domain.com

# AI Intelligence (Optional)
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-3.5-flash
```

---

## 3. Production Deployment with Docker Compose

1. Clone the repository on the target server:
   ```bash
   git clone https://github.com/Mayurrr02/RepoHub-GitInsight-AI.git /opt/repohub
   cd /opt/repohub
   ```

2. Build and launch all services:
   ```bash
   docker compose -f docker-compose.prod.yml up --build -d
   ```

3. Verify service health:
   ```bash
   docker compose -f docker-compose.prod.yml ps
   curl http://localhost/health
   ```

---

## 4. SSL / TLS Setup with Let's Encrypt (Certbot)

To enable HTTPS with Let's Encrypt on your server:

```bash
sudo apt update && sudo apt install certbot -y
sudo certbot certonly --standalone -d your-domain.com
```

Mount certificates into Nginx in `docker-compose.prod.yml`:
```yaml
nginx:
  volumes:
    - /etc/letsencrypt:/etc/letsencrypt:ro
    - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    - ./nginx/conf.d:/etc/nginx/conf.d:ro
```

---

## 5. Monitoring & Dashboard Access

- **Prometheus UI**: `http://your-server-ip:9090` (internal access recommended)
- **Grafana Dashboards**: `http://your-server-ip:3000` (Default login: `admin` / `admin`)
  - Auto-provisioned dashboard: **RepoHub Enterprise Overview**
  - Metrics available: HTTP latency, active WebSockets, Celery task throughput, security audit events.

---

## 6. Post-Deployment Verification Checklist

- [ ] `curl -I https://your-domain.com/health` returns `HTTP/1.1 200 OK`
- [ ] Database migrations applied successfully (`alembic upgrade head`)
- [ ] Celery worker listening on Redis queue
- [ ] WebSocket connection connects at `wss://your-domain.com/api/v1/ws`
- [ ] GitHub OAuth login redirects and authenticates
- [ ] Prometheus scrapes `/metrics` without errors
