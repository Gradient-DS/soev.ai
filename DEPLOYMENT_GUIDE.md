# Production Deployment Guide - soev.ai Web Scraper Stack

This guide covers deploying soev.ai with the web scraper stack across two separate VMs for optimal performance and isolation.

**Target OS:** Rocky Linux 9 (with Ubuntu 22.04 alternatives provided)

**Prerequisites:**
- SSH access to both VMs
- Ports 80, 443 open on Web App VM
- Ports 8080, 3002, 8001 accessible between VMs
- Domain name pointing to Web App VM
- Basic familiarity with Docker and Linux command line

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
- **OS**: Rocky Linux 9 or Ubuntu 22.04 LTS
- **Ports**: 80, 443, 3080 (internal)

### Scraper VM
- **CPU**: 8+ cores (for Playwright rendering)
- **RAM**: 16GB minimum, 32GB recommended
- **Disk**: 100GB SSD (for models and cache)
- **OS**: Rocky Linux 9 or Ubuntu 22.04 LTS
- **Ports**: 8080, 3002, 8001 (accessible from Web App VM)

---

## Part 1: Scraper VM Setup

### 1.1 Initial Server Setup

**Rocky Linux:**
```bash
# Update system
sudo dnf update -y

# Install Docker
sudo dnf install -y dnf-plugins-core
sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Start and enable Docker
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker $USER

# Reboot to apply changes
sudo reboot
```

**Ubuntu (alternative):**
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

**Important for Rocky Linux:** SELinux may interfere with Docker volumes. If you encounter permission issues:
```bash
# Check SELinux status
sestatus

# Option 1: Set SELinux to permissive mode for Docker (recommended)
sudo semanage permissive -a container_t

# Option 2: Add SELinux context to Docker directories (more secure)
sudo chcon -Rt svirt_sandbox_file_t /opt/soev-ai

# Option 3: Disable SELinux (not recommended for production)
# sudo setenforce 0  # Temporary
# Edit /etc/selinux/config and set SELINUX=disabled  # Permanent
```

### 1.2 Firewall Configuration (Optional)

**Note:** Skip this section if your organization manages firewalls centrally or if you cannot modify firewall rules. Ensure that ports 8080, 3002, and 8001 are accessible from the Web App VM IP address through your existing firewall configuration.

**If you can configure firewall rules:**

Rocky Linux uses `firewalld`:
```bash
# Check if firewalld is running
sudo systemctl status firewalld

# Allow services from Web App VM only
# Replace <LIBRECHAT_VM_IP> with actual IP
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="<LIBRECHAT_VM_IP>" port port="8080" protocol="tcp" accept'
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="<LIBRECHAT_VM_IP>" port port="3002" protocol="tcp" accept'
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="<LIBRECHAT_VM_IP>" port port="8001" protocol="tcp" accept'

# Reload firewall
sudo firewall-cmd --reload
```

Ubuntu with UFW:
```bash
# Allow access from LibreChat VM only
sudo ufw allow from <LIBRECHAT_VM_IP> to any port 8080 proto tcp comment 'SearXNG from LibreChat'
sudo ufw allow from <LIBRECHAT_VM_IP> to any port 3002 proto tcp comment 'Firecrawl from LibreChat'
sudo ufw allow from <LIBRECHAT_VM_IP> to any port 8001 proto tcp comment 'Reranker from LibreChat'
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

### 1.6 Production Configuration

The repository includes `deploy-compose.scraper.yml` which is pre-configured for production deployment. It includes:

- All services set to `restart: always` for production reliability
- Ports bound to `0.0.0.0` (all interfaces) for external access from Web App VM
- Resource limits to prevent resource exhaustion
- Internal Docker networking for service-to-service communication

**Note:** Services communicate internally via Docker network. Only ports 8080, 3002, and 8001 are exposed to allow the Web App VM to connect.

### 1.7 Build and Start Services

```bash
cd /opt/soev-ai

# Load environment variables
source .env.scraper

# Build services (first time)
docker compose -f deploy-compose.scraper.yml build

# Start services
docker compose -f deploy-compose.scraper.yml up -d

# Check logs
docker compose -f deploy-compose.scraper.yml logs -f

# Verify services are running
docker compose -f deploy-compose.scraper.yml ps
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

**Rocky Linux:**
```bash
# Update system
sudo dnf update -y

# Install Docker
sudo dnf install -y dnf-plugins-core
sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Start and enable Docker
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker $USER

# Reboot
sudo reboot
```

**Rocky Linux (alternative):**
```bash
# Update system
sudo dnf update -y

# Install Docker
sudo dnf install -y dnf-plugins-core
sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Start and enable Docker
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker $USER

# Reboot
sudo reboot
```

**Important for Rocky Linux:** SELinux may interfere with volume mounts. If you encounter permission issues:
```bash
# Check SELinux status
sestatus

# Option 1: Set SELinux to permissive mode for Docker (recommended)
sudo semanage permissive -a container_t

# Option 2: Add SELinux context to volumes (more secure)
sudo chcon -Rt svirt_sandbox_file_t /srv/soevai
sudo chcon -Rt svirt_sandbox_file_t /opt/soev-ai

# Option 3: Disable SELinux (not recommended for production)
# sudo setenforce 0  # Temporary
# Edit /etc/selinux/config and set SELINUX=disabled  # Permanent
```

### 2.2 Firewall Configuration (Optional)

**Note:** Skip this section if your organization manages firewalls centrally. Ensure ports 80 and 443 are open to the public for HTTPS traffic.

**If you can configure firewall rules:**

Rocky Linux uses `firewalld`:
```bash
# Check if firewalld is running
sudo systemctl status firewalld

# Allow HTTP and HTTPS
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https

# Reload firewall
sudo firewall-cmd --reload
```

Ubuntu with UFW:
```bash
# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
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
DOMAIN_CLIENT=https://kwink.soev.ai
DOMAIN_SERVER=https://kwink.soev.ai
APP_TITLE=soev.ai

# Registration & Login
ALLOW_REGISTRATION=false
ALLOW_UNVERIFIED_EMAIL_LOGIN=false
ALLOW_EMAIL_LOGIN=true

# Scraper VM URLs (IMPORTANT - use actual Scraper VM IP)
SEARXNG_INSTANCE_URL=http://100.74.0.20:8080
FIRECRAWL_API_URL=http://100.74.0.20:3002
JINA_API_URL=http://100.74.0.20:8001

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

The deployment uses automated SSL certificate management via the certbot container. Follow these steps:

#### Step 1: Prepare Certificate Directories

```bash
# Create required directories
sudo mkdir -p /srv/soevai/letsencrypt
sudo mkdir -p /srv/soevai/certbot-www
sudo mkdir -p /srv/soevai/letsencrypt-log

# Set permissions
sudo chmod -R 755 /srv/soevai
```

#### Step 2: Initial ACME Bootstrap

For the first-time setup, we'll use a minimal nginx config to obtain the certificate:

```bash
cd /opt/soev-ai

# Backup the production nginx.conf
cp client/nginx.conf client/nginx.conf.production

# Temporarily use the ACME-only config
cp client/nginx-acme.conf client/nginx.conf

# Replace the placeholder with your domain
sed -i 's/SERVER_NAME_PLACEHOLDER/kwink.soev.ai/g' client/nginx.conf
```

#### Step 3: Start Nginx for ACME Challenge

```bash
# Load environment variables
source .env

# Start nginx and certbot services only
docker compose -f deploy-compose.soev.ai.yml up -d client certbot

# Check nginx is running
docker compose -f deploy-compose.soev.ai.yml ps client
```

#### Step 4: Obtain SSL Certificate

```bash
# Obtain certificate using certbot container
docker compose -f deploy-compose.soev.ai.yml run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email your-email@example.com \
  --agree-tos \
  --no-eff-email \
  -d kwink.soev.ai

# Check that certificates were created
sudo ls -la /srv/soevai/letsencrypt/live/kwink.soev.ai/

# You should see:
# - cert.pem
# - chain.pem
# - fullchain.pem
# - privkey.pem
```

**Alternative: Using standalone mode:**
```bash
# Stop nginx temporarily
docker compose -f deploy-compose.soev.ai.yml stop client

# Obtain certificate
docker compose -f deploy-compose.soev.ai.yml run --rm certbot certonly \
  --standalone \
  --preferred-challenges http \
  --email your-email@example.com \
  --agree-tos \
  --no-eff-email \
  -d kwink.soev.ai
```

#### Step 5: Switch to Production Nginx Config

```bash
# Restore the production nginx config (with SSL)
cp client/nginx.conf.production client/nginx.conf

# Restart nginx to load SSL configuration
docker compose -f deploy-compose.soev.ai.yml restart client

# Check nginx logs
docker logs nginx-soevai -f
```

#### Step 6: Verify HTTPS is Working

```bash
# Test HTTPS
curl -I https://kwink.soev.ai/

# Should return 200 OK with SSL
```

#### Automatic Renewal

The certbot container in `deploy-compose.soev.ai.yml` automatically renews certificates every 12 hours. No manual intervention needed.

**Verify auto-renewal is working:**
```bash
# Check certbot container logs
docker logs certbot-soevai -f

# Test renewal manually (dry run)
docker compose -f deploy-compose.soev.ai.yml exec certbot certbot renew --dry-run
```

### 2.7 Start All Services

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
curl https://kwink.soev.ai/api/health

# Check if scraper services are accessible from Web App VM
docker exec -it librechat_api curl http://100.74.0.20:8080/search?q=test
docker exec -it librechat_api curl http://100.74.0.20:3002/health
docker exec -it librechat_api curl http://100.74.0.20:8001/health
```

### 3.2 Test Web Search in UI

1. Log into https://kwink.soev.ai
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
docker compose -f deploy-compose.scraper.yml logs -f

# View specific service
docker logs scraper_searxng -f
docker logs scraper_firecrawl_api -f
docker logs scraper_reranker -f

# Clear old logs (optional)
docker compose -f deploy-compose.scraper.yml logs --tail=1000 > /var/log/scraper.log
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
  deploy-compose.scraper.yml \
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
docker compose -f deploy-compose.scraper.yml build --no-cache

# Restart with zero downtime
docker compose -f deploy-compose.scraper.yml up -d
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

## Part 5: Security Best Practices

### 5.1 Scraper VM Security

**System Updates:**
```bash
# Rocky Linux - Enable automatic security updates
sudo dnf install -y dnf-automatic
sudo systemctl enable --now dnf-automatic.timer

# Ubuntu - Enable automatic security updates
sudo apt install unattended-upgrades -y
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

**Docker Security:**
```bash
# Limit resource usage to prevent DoS
# Already configured in deploy-compose.scraper.yml

# Keep Docker updated
sudo dnf update docker-ce docker-ce-cli  # Rocky Linux
# or
sudo apt update && sudo apt upgrade docker-ce  # Ubuntu
```

### 5.2 Web App VM Security

**System Updates:**
```bash
# Same as Scraper VM above
```

**Application Security:**
- Ensure `.env` file has strong, unique secrets
- Regularly update Docker images
- Monitor logs for suspicious activity

### 5.3 Network Security Recommendations

**IP Allowlisting:**
If your organization allows, configure firewall rules to:
- Allow scraper services (8080, 3002, 8001) only from Web App VM IP
- Allow Web App (80, 443) from trusted networks only
- Use your organization's VPN/firewall for access control

**Service Isolation:**
- Scraper VM services should not be publicly accessible
- Only Web App VM should communicate with Scraper VM
- Use internal/private IPs where possible

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
docker compose -f deploy-compose.scraper.yml ps
netstat -tlnp | grep -E '8080|3002|8001'
```

### 6.2 Reranker Fails to Start

**Problem:** Reranker exits with dependency errors

**Solution:**
```bash
# Rebuild with no cache
cd /opt/soev-ai
docker compose -f deploy-compose.scraper.yml stop reranker_proxy
docker compose -f deploy-compose.scraper.yml rm reranker_proxy
docker rmi kwinksoevai-reranker_proxy
docker compose -f deploy-compose.scraper.yml build --no-cache reranker_proxy
docker compose -f deploy-compose.scraper.yml up -d reranker_proxy

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
# deploy-compose.scraper.yml - Adjust resources based on load

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
docker compose -f deploy-compose.scraper.yml up -d
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
- [ ] Rocky Linux 9 (or Ubuntu 22.04) installed
- [ ] Docker & Docker Compose installed
- [ ] Firecrawl submodule initialized
- [ ] `.env.scraper` configured with secrets
- [ ] Firewall allows access from Web App VM IP (if configurable)
- [ ] `searxng/settings.yml` configured for production
- [ ] Services started and verified
- [ ] Accessible from Web App VM on ports 8080, 3002, 8001

### Web App VM
- [ ] Rocky Linux 9 (or Ubuntu 22.04) installed
- [ ] Docker & Docker Compose installed
- [ ] `.env` configured with all secrets
- [ ] SSL certificates obtained via certbot
- [ ] `librechat.soev.ai.yaml` configured
- [ ] Scraper VM URLs configured in `.env`
- [ ] Services started and verified
- [ ] Domain pointing to server
- [ ] HTTPS working and auto-renewal enabled

### Both VMs
- [ ] Automatic security updates configured
- [ ] Backups configured
- [ ] Monitoring in place
- [ ] Update procedure documented

---

## Support & Resources

- **Firecrawl Docs**: https://docs.firecrawl.dev/
- **SearXNG Docs**: https://docs.searxng.org/
- **LibreChat Docs**: https://www.librechat.ai/docs/
- **Docker Docs**: https://docs.docker.com/
- **Rocky Linux Docs**: https://docs.rockylinux.org/

## Rocky Linux Quick Reference

### Package Management
```bash
# Update system
sudo dnf update -y

# Install package
sudo dnf install -y package-name

# Search for package
sudo dnf search keyword

# Remove package
sudo dnf remove package-name
```

### Service Management
```bash
# Start service
sudo systemctl start service-name

# Stop service
sudo systemctl stop service-name

# Enable service (start on boot)
sudo systemctl enable service-name

# Check service status
sudo systemctl status service-name

# View service logs
sudo journalctl -u service-name -f
```

### Firewall Management (firewalld)
```bash
# Check status
sudo firewall-cmd --state

# List all rules
sudo firewall-cmd --list-all

# Add service
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --reload

# Add port
sudo firewall-cmd --permanent --add-port=8080/tcp
sudo firewall-cmd --reload

# Add rich rule (IP-specific)
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="10.0.0.1" port port="8080" protocol="tcp" accept'
sudo firewall-cmd --reload
```

### File Permissions
```bash
# Change ownership
sudo chown -R user:group /path/to/directory

# Change permissions
sudo chmod -R 755 /path/to/directory
```

## Need Help?

Check logs first:
```bash
# Scraper VM
docker compose -f deploy-compose.scraper.yml logs -f

# Web App VM
docker compose -f deploy-compose.soev.ai.yml logs -f api
```

Common issues are usually:
1. Firewall blocking connections between VMs
2. Environment variables not set correctly
3. Services not bound to 0.0.0.0 (external interface)
4. Missing or incorrect API keys

