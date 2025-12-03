# Manual Deployment Guide

This guide explains how to manually deploy soev.ai to a production server using the deployment scripts.

## Prerequisites

- A Linux server (Ubuntu/Debian recommended) with SSH access
- SSH private key with access to the server (as `root` or `deploy` user)
- Docker and Docker Compose installed on the server (or let the script install them)
- DNS A record pointing your domain to the server IP
- Required environment variables and secrets (see Configuration section)

## Quick Start

1. **Create your environment file:**

```bash
cp deployment/config.env.example deployment/config.env
# Edit deployment/config.env with your actual values
```

2. **Run the deployment:**

```bash
./deployment/deploy.sh -i YOUR_SERVER_IP -d your-domain.com
```

## Detailed Usage

### Basic Deployment

```bash
./deployment/deploy.sh \
  --ip 192.168.1.100 \
  --domain chat.soev.ai \
  --tag latest \
  --config librechat.soev.ai.yaml \
  --env-file deployment/config.env
```

### Advanced Options

```bash
./deployment/deploy.sh \
  --ip 192.168.1.100 \
  --domain chat.soev.ai \
  --tag v1.2.3 \
  --config librechat.soev.ai.yaml \
  --env-file deployment/config.env \
  --ssh-key ~/.ssh/id_ed25519 \
  --app-title "My App" \
  --allow-registration false
```

### Skip Steps (for re-deployments)

If you're re-deploying to an already configured server:

```bash
./deployment/deploy.sh \
  --ip 192.168.1.100 \
  --domain chat.soev.ai \
  --skip-bootstrap \
  --skip-dns \
  --skip-cert
```

## Configuration

### Environment Variables

Create `deployment/config.env` based on `deployment/config.env.example`. Required variables:

**Required:**
- `GH_PAT` - GitHub Personal Access Token for GHCR
- `GHCR_USERNAME` - GitHub username for container registry
- `JWT_SECRET` - Secret for JWT tokens
- `JWT_REFRESH_SECRET` - Secret for JWT refresh tokens
- `CREDS_KEY` - Encryption key for credentials
- `CREDS_IV` - Initialization vector for encryption
- `MEILI_MASTER_KEY` - Meilisearch master key

**Optional but recommended:**
- `GRADIENT_MAIL` - Email for Let's Encrypt certificates
- `OPENAI_API_KEY` - OpenAI API key
- `HF_KEY` - HuggingFace API key
- Other API keys as needed

### SSH Key

By default, the script uses `~/.ssh/id_rsa`. Specify a different key:

```bash
./deployment/deploy.sh -i IP -d DOMAIN --ssh-key ~/.ssh/id_ed25519
```

Or set the `SSH_PRIVATE_KEY` environment variable:

```bash
export SSH_PRIVATE_KEY=~/.ssh/custom_key
./deployment/deploy.sh -i IP -d DOMAIN
```

## Deployment Process

The deployment script performs the following steps:

1. **SSH Connection** - Waits for SSH to be available and tests connection
2. **User Detection** - Detects if connecting as `root` or `deploy` user
3. **Deploy User Bootstrap** - Creates `deploy` user if connecting as `root`
4. **VM Bootstrap** - Installs required packages, Docker, configures firewall (skipped with `--skip-bootstrap`)
5. **Bundle Preparation** - Creates deployment bundle with compose files and configs
6. **Upload** - Uploads bundle and environment file to server
7. **GHCR Authentication** - Logs into GitHub Container Registry
8. **Application Start** - Extracts bundle and starts Docker Compose stack
9. **DNS Check** - Verifies DNS propagation (skipped with `--skip-dns`)
10. **SSL Certificate** - Issues Let's Encrypt certificate and configures Nginx (skipped with `--skip-cert`)
11. **Smoke Tests** - Verifies application is accessible via HTTPS
12. **Logs Collection** - Collects and displays container logs

## What Gets Deployed

The deployment bundle includes:
- `deploy-compose.soev.ai.yml` - Docker Compose configuration
- `nginx/nginx-prod.conf` - Production Nginx configuration
- `nginx/nginx-acme.conf` - ACME challenge Nginx configuration
- `nginx/nginx.tmpl.conf` - TLS-enabled Nginx template
- `librechat.soev.ai.yaml` - Application configuration (or specified config file)

## Server Requirements

The bootstrap process installs and configures:

- **System packages:** ca-certificates, curl, git, python3, python3-pip, docker.io, ufw, fail2ban, unattended-upgrades, auditd
- **Docker Compose:** v2.39.1 (if not already installed)
- **Firewall:** UFW configured to allow SSH (22), HTTP (80), HTTPS (443)
- **SSH Hardening:** Password authentication disabled, root login disabled
- **Security:** fail2ban, auditd, automatic security updates

## Troubleshooting

### SSH Connection Issues

If SSH connection fails:
- Verify the server is accessible: `ping YOUR_SERVER_IP`
- Check SSH key permissions: `chmod 600 ~/.ssh/your_key`
- Test SSH manually: `ssh -i ~/.ssh/your_key user@YOUR_SERVER_IP`

### DNS Propagation

If DNS check fails:
- Verify DNS A record exists: `dig +short A your-domain.com`
- Wait a few minutes for DNS propagation
- Use `--skip-dns` to skip the check

### SSL Certificate Issues

If certificate issuance fails:
- Ensure `GRADIENT_MAIL` is set in your env file
- Verify DNS is pointing to the server IP
- Check that ports 80 and 443 are open
- Use `--skip-cert` to skip certificate setup

### Container Issues

To debug container issues, SSH to the server and check logs:

```bash
ssh deploy@YOUR_SERVER_IP
cd /home/deploy/soevai
docker compose -f deploy-compose.soev.ai.yml ps
docker compose -f deploy-compose.soev.ai.yml logs
```

### View Logs

The deployment script collects logs at the end. To view them manually:

```bash
ssh deploy@YOUR_SERVER_IP
cd /home/deploy/soevai
docker logs librechat_api --tail=100
docker logs nginx-soevai --tail=100
```

## Re-deployment

To update an existing deployment:

1. **Update the image tag** in your env file or use `--tag` option
2. **Run deployment** with skip flags for already-configured steps:

```bash
./deployment/deploy.sh \
  --ip YOUR_SERVER_IP \
  --domain your-domain.com \
  --tag new-version \
  --skip-bootstrap \
  --skip-dns \
  --skip-cert
```

The script will:
- Upload new bundle and environment
- Pull new Docker images
- Restart containers with updated configuration

## Manual Steps (if needed)

If you need to perform steps manually:

### Start/Stop Services

```bash
ssh deploy@YOUR_SERVER_IP
cd /home/deploy/soevai
docker compose -f deploy-compose.soev.ai.yml up -d    # Start
docker compose -f deploy-compose.soev.ai.yml down     # Stop
docker compose -f deploy-compose.soev.ai.yml restart # Restart
```

### Update Environment

```bash
ssh deploy@YOUR_SERVER_IP
# Edit /home/deploy/.remote.env
cd /home/deploy/soevai
docker compose -f deploy-compose.soev.ai.yml down
docker compose --env-file /home/deploy/.remote.env -f deploy-compose.soev.ai.yml up -d
```

### Renew SSL Certificate

```bash
ssh deploy@YOUR_SERVER_IP
sudo docker run --rm \
  -v "/srv/soevai/letsencrypt:/etc/letsencrypt" \
  -v "/srv/soevai/certbot-www:/var/www/certbot" \
  -v "/srv/soevai/letsencrypt-log:/var/log/letsencrypt" \
  certbot/certbot:latest renew
docker exec nginx-soevai nginx -s reload
```

## Security Notes

- The deployment script creates a `deploy` user with passwordless sudo
- SSH is hardened (password auth disabled, root login disabled)
- Firewall is configured to only allow necessary ports
- Security updates are enabled automatically
- All secrets should be stored securely and never committed to git

## Support

For issues or questions:
1. Check the logs collected at the end of deployment
2. Review the troubleshooting section above
3. Check container logs on the server
4. Verify all environment variables are set correctly
