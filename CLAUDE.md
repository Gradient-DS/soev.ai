# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

soev.ai is a fork of [LibreChat](https://github.com/danny-avila/LibreChat) - an open-source AI chat application. This fork adds:
- Custom admin panel with configuration management
- Enhanced file search integration
- Web scraping stack integration (Firecrawl, SearXNG, Jina reranker)

### Git Submodules
- `firecrawl/` - Web scraping API (Mendable Firecrawl)
- `packages/agents/` - LibreChat agents package (Gradient-DS fork)

## Essential Commands

### Development
```bash
# Full build (all packages + frontend + admin)
npm run soev

# Clean install and build
npm run soev:clean

# Backend with hot-reload
npm run backend:dev

# Frontend with hot-reload (port 3090)
npm run frontend:dev
```

### Build Individual Packages
```bash
npm run build:data-provider    # packages/data-provider
npm run build:data-schemas     # packages/data-schemas
npm run build:agents           # packages/agents (submodule)
npm run build:api              # packages/api
npm run build:client-package   # packages/client
npm run build:admin-plugin     # packages/librechat-admin
npm run build:admin-frontend   # admin-frontend
npm run build:packages         # Build all core packages
```

### Testing
```bash
npm run test:client            # Client unit tests
npm run test:api               # API unit tests
npm run e2e                    # Playwright E2E tests (local)
npm run e2e:headed             # E2E tests with browser visible
npm run lint                   # ESLint
npm run lint:fix               # ESLint with auto-fix
```

### Bun Alternatives (faster builds)
```bash
npm run b:api                  # Run backend with bun
npm run b:client               # Build client with bun
npm run b:reinstall            # Clean reinstall with bun
```

### User Management
```bash
npm run create-user            # Create new user
npm run list-users             # List all users
npm run add-balance            # Add token balance to user
```

## Architecture

### Monorepo Structure (npm workspaces)
```
soev.ai/
├── api/                      # Express.js backend
│   ├── server/               # Server entry, routes, controllers
│   ├── app/clients/          # AI provider clients (Anthropic, OpenAI, etc.)
│   └── models/               # Mongoose models
├── client/                   # Main React frontend (Vite)
├── admin-frontend/           # Standalone React admin UI
├── packages/
│   ├── custom/               # Route mount point (loads admin)
│   ├── librechat-admin/      # Admin backend router (TypeScript)
│   ├── data-provider/        # React-Query hooks & API utilities
│   ├── data-schemas/         # Shared Zod schemas & types
│   ├── api/                  # MCP utilities & client helpers
│   ├── client/               # Shared React components
│   └── agents/               # AI agents (git submodule)
└── firecrawl/                # Web scraping API (git submodule)
```

### Admin Panel Architecture
Simplified admin panel with 2 tabs (Users, Features):

1. **packages/custom/mount.js** - Mounts admin router at `/admin`, provides `/api/reload` endpoint
2. **packages/librechat-admin/** - Express router with user CRUD and role permission management
3. **admin-frontend/** - React SPA with Users tab and Features tab

**Feature permissions** (prompts, agents, webSearch) use LibreChat's native Role model in MongoDB.
**Custom welcome** message stored in AdminSettings collection.
Changes apply immediately - no restart required.

### Key Entry Points
- `api/server/index.js` - Main backend entry, initializes Express app
- `client/src/main.tsx` - Frontend entry point
- `packages/custom/mount.js` - Custom extensions mount point

### Configuration Files
- `.env` - Environment variables (copy from `soevai.env.example`)
- `librechat.soev.ai.yaml` - Base runtime configuration

## Docker Compose Files
- `docker-compose.dev.yml` - Dev services (MongoDB, MeiliSearch, RAG, Ollama)
- `docker-compose.scraper.yml` - Web search stack (SearXNG, Firecrawl, Jina)
- `docker-compose.local.yml` - Local development stack
- `docker-compose.staging.yml` - Staging with monitoring and Airweave
- `docker-compose.prod.yml` - Production deployment

## Key Dependencies
- Backend: Express, Mongoose, Passport, LangChain, @modelcontextprotocol/sdk
- Frontend: React 18, Vite, TailwindCSS, Radix UI, TanStack Query, Jotai
- AI: OpenAI SDK, Anthropic SDK, Google Generative AI, @librechat/agents

## soev.ai Customizations
Key files modified from upstream LibreChat:
- `api/server/index.js` - Admin panel mount point
- `api/server/controllers/agents/client.js` - Enhanced file search tool support
- `client/src/components/Chat/Input/Files/` - Modified file upload UI
- `client/src/Providers/BadgeRowContext.tsx` - Auto-enable file_search on file add
- `client/src/components/Messages/HoverButtons.tsx` - Message action buttons
- `packages/api/src/mcp/parsers.ts` - MCP file_search reference tabs

## Airweave Integration

Airweave provides document retrieval from SharePoint/OneDrive via MCP server.

### Services (in docker-compose.staging.yml)
- `airweave-backend` - FastAPI backend (port 8001)
- `airweave-postgres` - PostgreSQL for metadata
- `airweave-qdrant` - Vector database for embeddings
- `airweave-redis` - Cache and pub/sub

### Key Environment Variables
```bash
AIRWEAVE_ENCRYPTION_KEY=    # Generate: openssl rand -base64 32
AIRWEAVE_STATE_SECRET=      # Generate: openssl rand -base64 32
AIRWEAVE_API_KEY=           # Generated after Airweave setup
AIRWEAVE_COLLECTION_ID=     # Collection readable_id

# Custom embeddings (OpenAI-compatible endpoint)
AIRWEAVE_EMBEDDINGS_API_KEY=     # API key for embeddings service
AIRWEAVE_EMBEDDINGS_BASE_URL=    # e.g., https://your-endpoint.com/v1
AIRWEAVE_EMBEDDINGS_MODEL=       # e.g., text-embedding-3-small

# Microsoft Entra ID (for SharePoint/OneDrive)
AZURE_CLIENT_ID=            # Application (client) ID
AZURE_TENANT_ID=            # Directory (tenant) ID
AZURE_CLIENT_SECRET=        # Client secret
```

### Setup Guide
See `docs/airweave-onedrive-setup.md` for SharePoint/OneDrive configuration.

### API Endpoints
- API docs: http://localhost:8001/docs
- MCP integrated via `librechat.soev.ai.yaml` mcpServers config
