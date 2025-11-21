# Local Development Environment Setup

When running LibreChat in development mode with `npm run backend:dev` and `npm run frontend:dev`, you need to set environment variables so that the web search configuration is automatically loaded.

## Create `.env` File

Create a `.env` file in the project root (`/Users/lexlubbers/Code/kwink.soev.ai/.env`) with these variables:

```bash
# ==============================================
# Web Search Configuration (Scraper Stack)
# ==============================================
# These should match your running docker-compose.scraper.yml services

SEARXNG_URL=http://localhost:8080
FIRECRAWL_API_URL=http://localhost:3002
FIRECRAWL_API_KEY=default-local-key
JINA_API_URL=http://localhost:8001
JINA_API_KEY=local-proxy-key

# ==============================================
# Database Configuration
# ==============================================

MONGO_URI=mongodb://127.0.0.1:27017/LibreChat
MEILI_HOST=http://127.0.0.1:7700
MEILI_MASTER_KEY=your-meili-master-key-here

# ==============================================
# Security Keys (REQUIRED)
# Generate with: openssl rand -hex 32
# ==============================================

JWT_SECRET=your-jwt-secret-here
JWT_REFRESH_SECRET=your-jwt-refresh-secret-here
CREDS_KEY=your-creds-key-here
CREDS_IV=your-creds-iv-here

# ==============================================
# App Configuration
# ==============================================

APP_TITLE=soev.ai (Dev)
HOST=0.0.0.0
PORT=3080
NODE_ENV=development

# ==============================================
# RAG API
# ==============================================

RAG_API_URL=http://127.0.0.1:8000
RAG_PORT=8000

# ==============================================
# UbiOps Configuration
# ==============================================

UBIOPS_KEY=your-ubiops-key-here

# ==============================================
# Optional API Keys
# ==============================================

# OPENAI_API_KEY=your-openai-key
# SERPER_API_KEY=your-serper-key
# COHERE_API_KEY=your-cohere-key

# ==============================================
# Development Settings
# ==============================================

ALLOW_EMAIL_LOGIN=true
ALLOW_REGISTRATION=true
DEBUG_LOGGING=true
DEBUG_CONSOLE=true
```

## Quick Setup Commands

```bash
# Navigate to project root
cd /Users/lexlubbers/Code/kwink.soev.ai

# Create .env file
cat > .env << 'EOF'
# Web Search Configuration
SEARXNG_URL=http://localhost:8080
FIRECRAWL_API_URL=http://localhost:3002
FIRECRAWL_API_KEY=default-local-key
JINA_API_URL=http://localhost:8001
JINA_API_KEY=local-proxy-key

# Database
MONGO_URI=mongodb://127.0.0.1:27017/LibreChat
MEILI_HOST=http://127.0.0.1:7700
MEILI_MASTER_KEY=$(openssl rand -hex 32)

# Security Keys
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
CREDS_KEY=$(openssl rand -hex 16)
CREDS_IV=$(openssl rand -hex 8)

# App Config
APP_TITLE=soev.ai (Dev)
HOST=0.0.0.0
PORT=3080
NODE_ENV=development

# RAG API
RAG_API_URL=http://127.0.0.1:8000
RAG_PORT=8000

# UbiOps (replace with your actual key)
UBIOPS_KEY=your-ubiops-key-here

# Development
ALLOW_EMAIL_LOGIN=true
ALLOW_REGISTRATION=true
DEBUG_LOGGING=true
EOF

# Verify it was created
cat .env
```

## Start Services

Once the `.env` file is created:

```bash
# Terminal 1: Start scraper services
docker compose -f docker-compose.scraper.yml up

# Terminal 2: Start backend
npm run backend:dev

# Terminal 3: Start frontend  
npm run frontend:dev
```

## Verification

After restarting with the `.env` file:

1. Check the backend logs - you should see:
   ```
   Web search firecrawlApiUrl: Using environment variable FIRECRAWL_API_URL (set in environment)
   ```
   Instead of:
   ```
   Web search firecrawlApiUrl: Using environment variable FIRECRAWL_API_URL:-http://localhost:3002 (not set in environment, user provided value)
   ```

2. Open the Web Search settings in UI - fields should be pre-filled
3. The configuration should work automatically without manual input

## Troubleshooting

If the UI still requires manual configuration:

1. **Restart the backend**: After creating `.env`, restart `npm run backend:dev`
2. **Check environment loading**: Add this to see if env vars are loaded:
   ```bash
   node -e "require('dotenv').config(); console.log(process.env.SEARXNG_URL)"
   ```
3. **Clear browser cache**: The UI might cache the configuration state
4. **Check .env location**: Must be in project root, not in subdirectories

## Alternative: Export in Shell

If you don't want to use a `.env` file, export before running:

```bash
export SEARXNG_URL=http://localhost:8080
export FIRECRAWL_API_URL=http://localhost:3002
export FIRECRAWL_API_KEY=default-local-key
export JINA_API_URL=http://localhost:8001
export JINA_API_KEY=local-proxy-key

# Then run
npm run backend:dev
```

## Why This Happens

LibreChat's web search feature:
1. Reads configuration from `librechat.soev.ai.yaml`
2. The YAML uses `${VAR:-default}` syntax
3. If the actual environment variable isn't set, it uses the default
4. LibreChat sees "default value used" and requires user confirmation in UI
5. Setting actual environment variables removes this requirement

By setting the environment variables, LibreChat knows the configuration is intentional and pre-fills the UI.

