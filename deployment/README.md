# Deployment Scripts

This directory contains scripts for manually deploying soev.ai to production servers.
These scripts should be run directly on the deployment VM.

## Reference Deployment Structure

The deployment creates this directory structure on the server:

```
/srv/soevai/
├── config/                  # Configuration files (from repo bundle)
│   ├── deploy-compose.soev.ai.yml
│   ├── nginx/
│   │   ├── nginx-prod.conf
│   │   └── security.txt
│   ├── monitoring/
│   └── librechat.soev.ai.yaml
├── data/                    # Persistent runtime data
│   ├── mongodb/
│   ├── meilisearch/
│   ├── uploads/
│   ├── logs/
│   └── images/
├── secrets/                 # Certificates and keys
│   ├── letsencrypt/
│   ├── certbot-www/
│   └── letsencrypt-log/
└── .deployed-versions       # Deployment history
```

## Quick Start

1. Copy and configure the environment file (in repo root):
```bash
cp .env.example .env
# Edit .env with your actual values
```

2. Run the deployment:
```bash
cd deployment
./deploy.sh -d your-domain.com
./deploy.sh -d soev.gradient-testing.nl
```

## Scripts

- **`deploy.sh`** - Main deployment script (orchestrates all steps)
- **`lib/common.sh`** - Common utility functions
- **`lib/ssh.sh`** - SSH connection and user detection
- **`lib/bootstrap.sh`** - VM bootstrap and system configuration
- **`lib/deploy.sh`** - Application deployment and stack management
- **`lib/certificate.sh`** - SSL certificate configuration

## Configuration

See `.env.example` in the repo root for required environment variables.

## Documentation

See `../DEPLOYMENT_GUIDE.md` for complete documentation.
