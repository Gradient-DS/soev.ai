# Production Deployment Guide - soev.ai Web Scraper Stack

This guide covers deploying soev.ai with the web scraper stack across two separate VMs for optimal performance and isolation.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      PRODUCTION SETUP                        │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────┐            ┌────────────────────────┐ │
│  │   WEB APP VM     │◄──────────►│   SCRAPER VM           │ │
│  │  (Main Server)   │   HTTP     │  (Scraper Services)    │ │
│  ├──────────────────┤            ├────────────────────────┤ │
│  │ - LibreChat API  │            │ - SearXNG (8080)       │ │
│  │ - Nginx          │            │ - Firecrawl (3002)     │ │
│  │ - MongoDB        │            │ - Reranker (8001)      │ │
│  │ - RAG API        │            │ - Playwright           │ │
│  │ - MeiliSearch    │            │ - Redis                │ │
│  └──────────────────┘            │ - PostgreSQL           │ │
│                                   └────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## VM Requirements

### Web App VM (Main Server)
- **CPU**: 4+ cores
- **RAM**: 8GB minimum, 16GB recommended
- **Disk**: 50GB SSD
- **OS**: Ubuntu 22.04 LTS
- **Ports**: 80, 443, 3080 (internal)

### Scraper VM
- **CPU**: 8+ cores (for Playwright rendering)
- **RAM**: 16GB minimum, 32GB recommended
- **Disk**: 100GB SSD (for models and cache)
- **OS**: Ubuntu 22.04 LTS
- **Ports**: 8080, 3002, 8001 (accessible from Web App VM)

---

## Part 1: Scraper VM Setup

### 1.1 Initial Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo apt install docker-compose-plugin -y

# Reboot to apply changes
sudo reboot
```

### 1.2 Firewall Configuration

```bash
# Allow SSH
sudo ufw allow 22/tcp

# Allow access from Web App VM only (replace with actual IP)
sudo ufw allow from <WEB_APP_VM_IP> to any port 8080 proto tcp  # SearXNG
sudo ufw allow from <WEB_APP_VM_IP> to any port 3002 proto tcp  # Firecrawl
sudo ufw allow from <WEB_APP_VM_IP> to any port 8001 proto tcp  # Reranker

# Enable firewall
sudo ufw enable
```

### 1.3 Clone Repository

```bash
cd /opt
sudo git clone <your-repo-url> soev-ai
cd soev-ai

# Add Firecrawl as submodule
git submodule add https://github.com/mendableai/firecrawl.git firecrawl
git submodule update --init --recursive
```

### 1.4 Environment Variables

Create `/opt/soev-ai/.env.scraper`:

```bash
# Scraper VM Environment Variables

# Proxy Settings (optional - only if you need proxies)
# PROXY_SERVER=http://proxy.example.com:8080
# PROXY_USERNAME=your_username
# PROXY_PASSWORD=your_password

# SearXNG Security (REQUIRED - generate with: openssl rand -hex 32)
SEARXNG_SECRET=<generate-with-openssl-rand-hex-32>

# Firecrawl (optional, has defaults)
FIRECRAWL_API_KEY=<generate-random-key>

# Reranker (optional, has defaults)
JINA_API_KEY=<generate-random-key>

# Media blocking (recommended for performance)
BLOCK_MEDIA=true
```

Generate secrets:
```bash
# Generate SEARXNG_SECRET
openssl rand -hex 32

# Generate API keys
openssl rand -hex 24
```

### 1.5 Configure SearXNG for Production

Edit `searxng/settings.yml`:

```yaml
server:
  secret_key: "<use-env-var-value>"  # Set from SEARXNG_SECRET
  limiter: false  # Or configure Redis/Valkey for rate limiting
  public_instance: false  # Set true if exposed to public
  image_proxy: true  # Enable for privacy
  base_url: "http://<SCRAPER_VM_IP>:8080"
  bind_address: "0.0.0.0"  # Listen on all interfaces
```

### 1.6 Update docker-compose.scraper.yml for Production

Edit `docker-compose.scraper.yml`:

```yaml
services:
  # ... existing services ...
  
  firecrawl_api:
    build: ./firecrawl/apps/api
    container_name: scraper_firecrawl_api
    restart: always  # Changed from unless-stopped
    command: node dist/src/harness.js --start-docker
    ports:
      - "0.0.0.0:3002:3002"  # Bind to all interfaces
    # ... rest of config
  
  reranker_proxy:
    build: ./reranker-proxy
    container_name: scraper_reranker
    restart: always  # Changed from unless-stopped
    ports:
      - "0.0.0.0:8001:8000"  # Bind to all interfaces
    # ... rest of config
  
  searxng:
    image: searxng/searxng:latest
    container_name: scraper_searxng
    restart: always  # Changed from unless-stopped
    ports:
      - "0.0.0.0:8080:8080"  # Bind to all interfaces
    # ... rest of config
```

### 1.7 Build and Start Services

```bash
cd /opt/soev-ai

# Load environment variables
source .env.scraper

# Build services (first time)
docker compose -f docker-compose.scraper.yml build

# Start services
docker compose -f docker-compose.scraper.yml up -d

# Check logs
docker compose -f docker-compose.scraper.yml logs -f

# Verify services are running
docker compose -f docker-compose.scraper.yml ps
```

### 1.8 Verify Scraper Services

```bash
# Test SearXNG
curl "http://localhost:8080/search?q=test&format=json" | jq '.results | length'

# Test Firecrawl
curl -X POST http://localhost:3002/v1/scrape \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <FIRECRAWL_API_KEY>" \
  -d '{"url": "https://example.com"}'

# Test Reranker
curl -X POST http://localhost:8001/v1/rerank \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <JINA_API_KEY>" \
  -d '{
    "model": "jina-reranker-v1-base-en",
    "query": "test query",
    "documents": ["doc1", "doc2"]
  }'
```

---

## Part 2: Web App VM Setup

### 2.1 Initial Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo apt install docker-compose-plugin -y

# Reboot
sudo reboot
```

### 2.2 Firewall Configuration

```bash
# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Allow SSH
sudo ufw allow 22/tcp

# Enable firewall
sudo ufw enable
```

### 2.3 Clone Repository

```bash
cd /opt
sudo git clone <your-repo-url> soev-ai
cd soev-ai
```

### 2.4 Environment Variables

Create `/opt/soev-ai/.env`:

```bash
# Web App VM Environment Variables

# CRITICAL SECURITY - Generate unique values!
JWT_SECRET=<openssl-rand-hex-32>
JWT_REFRESH_SECRET=<openssl-rand-hex-32>
CREDS_KEY=<openssl-rand-hex-16>
CREDS_IV=<openssl-rand-hex-8>

# Database
MEILI_MASTER_KEY=<openssl-rand-hex-32>

# Domain Configuration
DOMAIN_CLIENT=https://yourdomain.com
DOMAIN_SERVER=https://yourdomain.com
APP_TITLE=soev.ai

# Registration & Login
ALLOW_REGISTRATION=false
ALLOW_UNVERIFIED_EMAIL_LOGIN=false
ALLOW_EMAIL_LOGIN=true

# Scraper VM URLs (IMPORTANT - use actual Scraper VM IP)
SEARXNG_URL=http://<SCRAPER_VM_IP>:8080
FIRECRAWL_API_URL=http://<SCRAPER_VM_IP>:3002
JINA_API_URL=http://<SCRAPER_VM_IP>:8001

# API Keys from Scraper VM
FIRECRAWL_API_KEY=<same-as-scraper-vm>
JINA_API_KEY=<same-as-scraper-vm>

# Optional: Other API Keys
# OPENAI_API_KEY=<your-openai-key>
# SERPER_API_KEY=<your-serper-key>
# COHERE_API_KEY=<your-cohere-key>

# UbiOps Configuration (if using)
UBIOPS_KEY=<your-ubiops-key>

# RAG Configuration
RAG_PORT=8000
RAG_OPENAI_API_KEY=<your-openai-key-for-rag>

# Azure OpenID (if using)
# OPENID_ISSUER=<your-azure-openid-issuer>
# OPENID_CLIENT_ID=<your-client-id>
# OPENID_CLIENT_SECRET=<your-client-secret>

# LibreChat Image Tag
LIBRECHAT_TAG=latest

# Balance Configuration
START_BALANCE=2000000

# Endpoints
ENDPOINTS=soev.ai
```

Generate secrets:
```bash
# Generate all secrets at once
echo "JWT_SECRET=$(openssl rand -hex 32)"
echo "JWT_REFRESH_SECRET=$(openssl rand -hex 32)"
echo "CREDS_KEY=$(openssl rand -hex 16)"
echo "CREDS_IV=$(openssl rand -hex 8)"
echo "MEILI_MASTER_KEY=$(openssl rand -hex 32)"
```

### 2.5 Update librechat.soev.ai.yaml

The file is already configured with environment variables. Verify these settings:

```yaml
webSearch:
  searchProvider: "searxng"
  searxngUrl: "${SEARXNG_URL:-http://localhost:8080}"  # Will use .env value
  
  scraperType: "firecrawl"
  firecrawlApiUrl: "${FIRECRAWL_API_URL:-http://localhost:3002}"  # Will use .env value
  firecrawlApiKey: "${FIRECRAWL_API_KEY:-default-local-key}"
  
  useReranker: true
  rerankerProvider: "jina"
  jinaApiUrl: "${JINA_API_URL:-http://localhost:8001}"  # Will use .env value
  jinaApiKey: "${JINA_API_KEY:-local-proxy-key}"
  
  topResults: 5
  numResults: 3
```

### 2.6 SSL Certificate Setup

```bash
# Install Certbot
sudo apt install certbot -y

# Stop nginx if running
docker compose -f deploy-compose.soev.ai.yml stop client

# Obtain certificate (replace yourdomain.com)
sudo certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com

# Copy certificates to expected location
sudo mkdir -p /srv/soevai/letsencrypt
sudo cp -r /etc/letsencrypt/* /srv/soevai/letsencrypt/
```

### 2.7 Configure Nginx

Ensure `client/nginx.conf` is configured for your domain with SSL.

### 2.8 Start Services

```bash
cd /opt/soev-ai

# Load environment variables
source .env

# Start services
docker compose -f deploy-compose.soev.ai.yml up -d

# Check logs
docker compose -f deploy-compose.soev.ai.yml logs -f api

# Verify all services
docker compose -f deploy-compose.soev.ai.yml ps
```

---

## Part 3: Verification & Testing

### 3.1 Test Web App

```bash
# Check API health
curl https://yourdomain.com/api/health

# Check if scraper services are accessible from Web App VM
docker exec -it librechat_api curl http://<SCRAPER_VM_IP>:8080/search?q=test
docker exec -it librechat_api curl http://<SCRAPER_VM_IP>:3002/health
docker exec -it librechat_api curl http://<SCRAPER_VM_IP>:8001/health
```

### 3.2 Test Web Search in UI

1. Log into https://yourdomain.com
2. Start a new conversation
3. Enable "Web Search" toggle
4. Ask a question
5. Verify search results appear with citations

---

## Part 4: Monitoring & Maintenance

### 4.1 Log Management

**Scraper VM:**
```bash
# View all logs
docker compose -f docker-compose.scraper.yml logs -f

# View specific service
docker logs scraper_searxng -f
docker logs scraper_firecrawl_api -f
docker logs scraper_reranker -f

# Clear old logs (optional)
docker compose -f docker-compose.scraper.yml logs --tail=1000 > /var/log/scraper.log
```

**Web App VM:**
```bash
# View all logs
docker compose -f deploy-compose.soev.ai.yml logs -f

# View API logs
docker logs librechat_api -f

# Application logs
tail -f logs/debug-*.log
tail -f logs/error-*.log
```

### 4.2 Resource Monitoring

```bash
# Check Docker resource usage
docker stats

# Check disk space
df -h

# Check memory
free -h

# Check service status
docker compose ps
```

### 4.3 Backups

**Scraper VM (minimal backup needed):**
```bash
# Backup configuration
cd /opt/soev-ai
tar -czf scraper-config-$(date +%Y%m%d).tar.gz \
  docker-compose.scraper.yml \
  searxng/settings.yml \
  .env.scraper

# Upload to backup storage
```

**Web App VM (critical data):**
```bash
# Backup MongoDB
docker exec chat-mongodb mongodump --out /backup
docker cp chat-mongodb:/backup ./mongodb-backup-$(date +%Y%m%d)

# Backup MeiliSearch
tar -czf meili-backup-$(date +%Y%m%d).tar.gz meili_data_v1.12/

# Backup config and uploads
tar -czf app-data-$(date +%Y%m%d).tar.gz \
  librechat.soev.ai.yaml \
  soev.ai.yaml \
  admin-overrides.yaml \
  uploads/ \
  .env

# Upload to backup storage
```

### 4.4 Update Procedure

**Scraper VM:**
```bash
cd /opt/soev-ai

# Pull latest changes
git pull
git submodule update --init --recursive

# Rebuild services
docker compose -f docker-compose.scraper.yml build --no-cache

# Restart with zero downtime
docker compose -f docker-compose.scraper.yml up -d
```

**Web App VM:**
```bash
cd /opt/soev-ai

# Pull latest changes
git pull

# Pull new image
docker compose -f deploy-compose.soev.ai.yml pull

# Restart services
docker compose -f deploy-compose.soev.ai.yml up -d

# Check health
docker compose -f deploy-compose.soev.ai.yml ps
```

---

## Part 5: Security Hardening

### 5.1 Scraper VM Security

```bash
# Limit SSH access
sudo vi /etc/ssh/sshd_config
# Set: PermitRootLogin no
# Set: PasswordAuthentication no
sudo systemctl restart sshd

# Install fail2ban
sudo apt install fail2ban -y
sudo systemctl enable fail2ban

# Regular security updates
sudo apt update && sudo apt upgrade -y
```

### 5.2 Web App VM Security

```bash
# Same SSH hardening as above

# Configure automatic security updates
sudo apt install unattended-upgrades -y
sudo dpkg-reconfigure --priority=low unattended-upgrades

# Monitor failed login attempts
sudo journalctl -u ssh -f
```

### 5.3 Network Security

```bash
# On both VMs: Implement IP allowlisting
sudo ufw status numbered
sudo ufw delete <rule-number>  # Remove any overly permissive rules

# Web App VM: Only allow Scraper VM IP
sudo ufw allow from <SCRAPER_VM_IP> to any port 3080

# Scraper VM: Only allow Web App VM IP
sudo ufw allow from <WEB_APP_VM_IP> to any port 8080
sudo ufw allow from <WEB_APP_VM_IP> to any port 3002
sudo ufw allow from <WEB_APP_VM_IP> to any port 8001
```

---

## Part 6: Troubleshooting

### 6.1 Scraper Services Not Reachable

**Problem:** Web App can't reach scraper services

**Solution:**
```bash
# On Web App VM, test connectivity
telnet <SCRAPER_VM_IP> 8080
telnet <SCRAPER_VM_IP> 3002
telnet <SCRAPER_VM_IP> 8001

# Check firewall on Scraper VM
sudo ufw status

# Check services are bound to 0.0.0.0
docker compose -f docker-compose.scraper.yml ps
netstat -tlnp | grep -E '8080|3002|8001'
```

### 6.2 Reranker Fails to Start

**Problem:** Reranker exits with dependency errors

**Solution:**
```bash
# Rebuild with no cache
cd /opt/soev-ai
docker compose -f docker-compose.scraper.yml stop reranker_proxy
docker compose -f docker-compose.scraper.yml rm reranker_proxy
docker rmi kwinksoevai-reranker_proxy
docker compose -f docker-compose.scraper.yml build --no-cache reranker_proxy
docker compose -f docker-compose.scraper.yml up -d reranker_proxy

# Check logs
docker logs scraper_reranker -f
```

### 6.3 SearXNG Returns No Results

**Problem:** SearXNG fails or returns empty results

**Solution:**
```bash
# Check if engines are enabled
docker exec scraper_searxng cat /etc/searxng/settings.yml | grep -A 5 "disabled: false"

# Test directly
curl "http://<SCRAPER_VM_IP>:8080/search?q=test&format=json"

# Check logs
docker logs scraper_searxng -f
```

### 6.4 Firecrawl Scraping Fails

**Problem:** Firecrawl times out or fails to scrape

**Solution:**
```bash
# Check Playwright service
docker logs scraper_playwright -f

# Check Firecrawl workers
docker logs scraper_firecrawl_api | grep "worker"

# Increase timeouts in librechat.soev.ai.yaml
# scraperTimeout: 60000  # Increase to 60 seconds
```

---

## Part 7: Performance Optimization

### 7.1 Scraper VM Optimization

```yaml
# docker-compose.scraper.yml - Adjust resources based on load

services:
  firecrawl_api:
    deploy:
      resources:
        limits:
          memory: 8G  # Increase if needed
          cpus: '6.0'
        reservations:
          memory: 4G
          cpus: '2.0'
  
  playwright_service:
    shm_size: 4gb  # Increase for more concurrent pages
    deploy:
      resources:
        limits:
          memory: 8G
```

### 7.2 Web App VM Optimization

```yaml
# deploy-compose.soev.ai.yml - Add resource limits

services:
  api:
    deploy:
      resources:
        limits:
          memory: 4G
          cpus: '4.0'
```

### 7.3 Database Optimization

```bash
# MongoDB indexing (on Web App VM)
docker exec -it chat-mongodb mongosh LibreChat --eval '
  db.conversations.createIndex({user: 1, createdAt: -1});
  db.messages.createIndex({conversationId: 1, createdAt: 1});
'
```

---

## Part 8: Scaling

### 8.1 Horizontal Scaling (Multiple Scraper VMs)

If you need more scraping capacity:

1. **Deploy additional Scraper VMs** with same configuration
2. **Use load balancer** in front of scraper services
3. **Update Web App .env** to point to load balancer

```bash
# Example with HAProxy
SEARXNG_URL=http://scraper-lb.internal:8080
FIRECRAWL_API_URL=http://scraper-lb.internal:3002
JINA_API_URL=http://scraper-lb.internal:8001
```

### 8.2 Vertical Scaling

For single VM setups under heavy load:
- Increase CPU/RAM on Scraper VM
- Add SSD cache storage
- Optimize Docker resource limits

---

## Part 9: Disaster Recovery

### 9.1 Full Recovery Procedure

**Scraper VM:**
```bash
# New VM setup
curl -fsSL https://get.docker.com | sh

# Restore config
cd /opt
git clone <repo>
cd soev-ai
tar -xzf scraper-config-backup.tar.gz

# Rebuild and start
docker compose -f docker-compose.scraper.yml up -d
```

**Web App VM:**
```bash
# New VM setup
curl -fsSL https://get.docker.com | sh

# Restore config and data
cd /opt
git clone <repo>
cd soev-ai
tar -xzf app-data-backup.tar.gz
tar -xzf mongodb-backup.tar.gz
tar -xzf meili-backup.tar.gz

# Restore MongoDB
docker compose -f deploy-compose.soev.ai.yml up -d mongodb
docker cp mongodb-backup chat-mongodb:/backup
docker exec chat-mongodb mongorestore /backup

# Start all services
docker compose -f deploy-compose.soev.ai.yml up -d
```

---

## Summary Checklist

### Scraper VM
- [ ] Ubuntu 22.04 installed
- [ ] Docker & Docker Compose installed
- [ ] Firecrawl submodule initialized
- [ ] `.env.scraper` configured with secrets
- [ ] Firewall configured (UFW)
- [ ] `searxng/settings.yml` configured for production
- [ ] Services started and verified
- [ ] Accessible from Web App VM

### Web App VM
- [ ] Ubuntu 22.04 installed
- [ ] Docker & Docker Compose installed
- [ ] `.env` configured with all secrets
- [ ] SSL certificates obtained and configured
- [ ] `librechat.soev.ai.yaml` configured
- [ ] Scraper VM URLs configured in `.env`
- [ ] Services started and verified
- [ ] Domain pointing to server
- [ ] HTTPS working

### Both VMs
- [ ] Backups configured
- [ ] Monitoring in place
- [ ] Security hardening applied
- [ ] Update procedure documented

---

## Support & Resources

- **Firecrawl Docs**: https://docs.firecrawl.dev/
- **SearXNG Docs**: https://docs.searxng.org/
- **LibreChat Docs**: https://www.librechat.ai/docs/
- **Docker Docs**: https://docs.docker.com/

## Need Help?

Check logs first:
```bash
# Scraper VM
docker compose -f docker-compose.scraper.yml logs -f

# Web App VM
docker compose -f deploy-compose.soev.ai.yml logs -f api
```

Common issues are usually:
1. Firewall blocking connections between VMs
2. Environment variables not set correctly
3. Services not bound to 0.0.0.0 (external interface)
4. Missing or incorrect API keys

