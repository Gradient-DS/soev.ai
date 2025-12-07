# soev-rag Integration Plan

## Overview
Replace the current Airweave stack and LibreChat RAG API with soev-rag for document retrieval and SharePoint integration.

## Files to Create/Modify

### 1. Create `docker-compose.soev-rag.yml` (NEW)
A dedicated compose file for testing soev-rag integration.

**Services to include:**
- `weaviate` - Vector database (replaces vectordb/pgvector)
- `rag_api` - soev-rag API on port 8100 (build from `../soev-rag`)
- `sharepoint-worker` - SharePoint sync worker (build from `../soev-rag`)
- `mongodb`, `meilisearch` - Keep as-is
- `librechat_api` - Update `RAG_API_URL` to port 8100
- `nginx` - Keep as-is
- Full monitoring stack (prometheus, grafana, alertmanager, node-exporter, metrics)

### 2. Modify `librechat.soev.ai.yaml`
Update the SharePoint MCP server configuration:

**Current (lines 172-193):**
```yaml
SharePoint:
  type: stdio
  command: npx
  args:
    - -y
    - airweave-mcp-search
  env:
    AIRWEAVE_API_KEY: ${AIRWEAVE_API_KEY}
    AIRWEAVE_COLLECTION: ${AIRWEAVE_COLLECTION_ID}
    AIRWEAVE_BASE_URL: http://airweave-backend:8001
```

**New:**
```yaml
SharePoint:
  type: streamable-http
  url: http://rag_api:8100/mcp
  headers:
    Authorization: Bearer ${JWT_SECRET}
  timeout: 60000
  chatMenu: true
  serverInstructions: |
    Available tools:
    - sharepoint_search: Semantic search across SharePoint documents
    - sharepoint_list_files: List all indexed files
    - sharepoint_stats: Get index statistics
```

## Environment Variables

### Variables to ADD/UPDATE in `.env`:

```bash
# soev-rag uses these (reusing existing values)
NEBUL_RAG=<existing value>              # Already set
RAG_OPENAI_BASE_URL=<existing value>    # Already set
RAG_EMBEDDINGS_MODEL=<existing value>   # Already set

# SharePoint sync settings (new)
SHAREPOINT_SITE_URL=${SHAREPOINT_URL}   # Reuse existing SHAREPOINT_URL
SHAREPOINT_SYNC_CRON=0 * * * *          # Hourly sync (optional)
```

### Variables that can be REMOVED (only used by Airweave):
```bash
AIRWEAVE_ENCRYPTION_KEY
AIRWEAVE_STATE_SECRET
AIRWEAVE_DB_PASSWORD
AIRWEAVE_EMBEDDINGS_API_KEY    # Replaced by NEBUL_RAG
AIRWEAVE_EMBEDDINGS_BASE_URL   # Replaced by RAG_OPENAI_BASE_URL
AIRWEAVE_EMBEDDINGS_MODEL      # Replaced by RAG_EMBEDDINGS_MODEL
AIRWEAVE_EMBEDDING_DIM
AIRWEAVE_ADMIN_EMAIL
AIRWEAVE_ADMIN_PASSWORD
AIRWEAVE_API_KEY
AIRWEAVE_COLLECTION_ID
SHAREPOINT_CONNECTION_ID
```

### Variables to KEEP (reused by soev-rag):
```bash
AZURE_CLIENT_ID
AZURE_TENANT_ID
AZURE_CLIENT_SECRET
JWT_SECRET
JWT_REFRESH_SECRET
NEBUL_RAG
RAG_OPENAI_BASE_URL
RAG_EMBEDDINGS_MODEL
SHAREPOINT_URL → renamed to SHAREPOINT_SITE_URL
```

## Docker Compose Changes Summary

| Current Service | Replacement | Notes |
|-----------------|-------------|-------|
| `vectordb` (pgvector) | `weaviate` | Different vector DB |
| `rag_api` (port 8000) | `rag_api` (port 8100) | soev-rag API |
| `airweave-backend` | Removed | Replaced by rag_api |
| `airweave-db` | Removed | Not needed |
| `airweave-qdrant` | Removed | Weaviate replaces |
| `airweave-redis` | Removed | Not needed |
| `airweave-temporal` | Removed | Not needed |
| `airweave-worker` | `sharepoint-worker` | Simpler cron-based sync |

## Key Port Changes
- RAG API: 8000 → 8100
- Update `RAG_API_URL` in librechat_api environment

## Implementation Steps

1. **Create `docker-compose.soev-rag.yml`**
   - Copy base structure from `docker-compose.staging.yml`
   - Replace `vectordb` with `weaviate` service
   - Replace `rag_api` with soev-rag build (port 8100)
   - Add `sharepoint-worker` service
   - Remove all airweave-* services
   - Update `librechat_api` environment: `RAG_API_URL: http://rag_api:8100`
   - Keep full monitoring stack

2. **Update `librechat.soev.ai.yaml` (lines 172-193)**
   - Change SharePoint MCP from stdio/npx to streamable-http
   - Point to `http://rag_api:8100/mcp`
   - Update serverInstructions for new tool names

## .env Variables Summary

**Keep these (already set):**
```bash
NEBUL_RAG=<your-key>
RAG_OPENAI_BASE_URL=https://api.chat.nebul.io/v1
RAG_EMBEDDINGS_MODEL=intfloat/multilingual-e5-large-instruct
JWT_SECRET=<existing>
AZURE_CLIENT_ID=<existing>
AZURE_TENANT_ID=<existing>
AZURE_CLIENT_SECRET=<existing>
```

**Add these:**
```bash
SHAREPOINT_SITE_URL=https://gradientdatascience.sharepoint.com/sites/soev.aidemo
SHAREPOINT_SYNC_CRON=0 * * * *
```

**Can remove (Airweave-only):**
```bash
AIRWEAVE_ENCRYPTION_KEY, AIRWEAVE_STATE_SECRET, AIRWEAVE_DB_PASSWORD
AIRWEAVE_EMBEDDINGS_*, AIRWEAVE_ADMIN_*, AIRWEAVE_API_KEY, AIRWEAVE_COLLECTION_ID
```

## Docker Compose Template

```yaml
# docker-compose.soev-rag.yml
networks:
  internal:
  edge:

services:
  ## CORE APPLICATION
  librechat_api:
    build:
      context: .
      dockerfile: Dockerfile.soev.ai.multi
      target: api-build
    container_name: librechat_api
    restart: unless-stopped
    environment:
      CONFIG_PATH: /app/librechat.soev.ai.yaml
      BASE_CONFIG_PATH: /app/librechat.soev.ai.yaml
      HOST: 0.0.0.0
      PORT: 3080
      MONGO_URI: mongodb://mongodb:27017/LibreChat
      MEILI_HOST: http://meilisearch:7700
      RAG_API_URL: http://rag_api:8100  # Changed from 8000
      SOEVAI_ROOT: /app
    depends_on:
      - mongodb
      - rag_api
    env_file:
      - .env
    volumes:
      - ./librechat.yaml:/app/librechat.yaml:ro
      - ./librechat.soev.ai.yaml:/app/librechat.soev.ai.yaml:rw
      - ./admin-overrides.yaml:/app/admin-overrides.yaml:rw
      - ./uploads:/app/uploads
      - ./logs:/app/api/logs
    ports:
      - "3080:3080"
    networks:
      - internal

  mongodb:
    image: mongo
    container_name: prod-mongodb
    restart: unless-stopped
    volumes:
      - ./data-node:/data/db
    command: mongod --noauth
    networks:
      - internal

  meilisearch:
    image: getmeili/meilisearch:v1.12.3
    container_name: prod-meilisearch
    restart: unless-stopped
    environment:
      MEILI_NO_ANALYTICS: "true"
      MEILI_MASTER_KEY: ${MEILI_MASTER_KEY}
    volumes:
      - ./meili_data_v1.12:/meili_data
    networks:
      - internal

  ## SOEV-RAG STACK
  weaviate:
    image: semitechnologies/weaviate:1.28.0
    container_name: soev-weaviate
    restart: unless-stopped
    environment:
      QUERY_DEFAULTS_LIMIT: 25
      AUTHENTICATION_ANONYMOUS_ACCESS_ENABLED: 'true'
      PERSISTENCE_DATA_PATH: '/var/lib/weaviate'
      DEFAULT_VECTORIZER_MODULE: 'none'
      CLUSTER_HOSTNAME: 'weaviate'
    volumes:
      - weaviate_data:/var/lib/weaviate
    networks:
      - internal
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:8080/v1/.well-known/ready"]
      interval: 10s
      timeout: 5s
      retries: 5

  rag_api:
    build:
      context: ../soev-rag
      dockerfile: Dockerfile.api
    container_name: soev-rag-api
    restart: unless-stopped
    environment:
      WEAVIATE_URL: http://weaviate:8080
      WEAVIATE_GRPC_PORT: 50051
      NEBUL_API_KEY: ${NEBUL_RAG}
      NEBUL_BASE_URL: ${RAG_OPENAI_BASE_URL}
      NEBUL_EMBEDDING_MODEL: ${RAG_EMBEDDINGS_MODEL}
      EMBEDDING_DIM: 1024
      JWT_SECRET: ${JWT_SECRET}
      CHUNK_SIZE: 1500
      CHUNK_OVERLAP: 100
    depends_on:
      weaviate:
        condition: service_healthy
    ports:
      - "8100:8100"
    networks:
      - internal

  sharepoint-worker:
    build:
      context: ../soev-rag
      dockerfile: Dockerfile.worker
    container_name: soev-sharepoint-worker
    restart: unless-stopped
    environment:
      WEAVIATE_URL: http://weaviate:8080
      WEAVIATE_GRPC_PORT: 50051
      NEBUL_API_KEY: ${NEBUL_RAG}
      NEBUL_BASE_URL: ${RAG_OPENAI_BASE_URL}
      NEBUL_EMBEDDING_MODEL: ${RAG_EMBEDDINGS_MODEL}
      EMBEDDING_DIM: 1024
      AZURE_CLIENT_ID: ${AZURE_CLIENT_ID}
      AZURE_TENANT_ID: ${AZURE_TENANT_ID}
      AZURE_CLIENT_SECRET: ${AZURE_CLIENT_SECRET}
      SHAREPOINT_SITE_URL: ${SHAREPOINT_SITE_URL:-}
      SHAREPOINT_SYNC_CRON: "0 * * * *"
    volumes:
      - sync_data:/data/sync_cursors
    depends_on:
      weaviate:
        condition: service_healthy
    networks:
      - internal

  ## REVERSE PROXY
  nginx:
    image: nginx:latest
    container_name: nginx-local
    ports:
      - "80:80"
    volumes:
      - ./nginx/nginx-dev.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - librechat_api
      - grafana
      - prometheus
      - alertmanager
      - metrics
    restart: unless-stopped
    networks:
      - internal
      - edge

  ## MONITORING STACK
  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus-local
    volumes:
      - ./monitoring/prometheus/prometheus-dev.yml:/etc/prometheus/prometheus.yml:ro
      - ./monitoring/prometheus/alerts.yml:/etc/prometheus/alerts.yml:ro
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=7d'
      - '--web.console.libraries=/usr/share/prometheus/console_libraries'
      - '--web.console.templates=/usr/share/prometheus/consoles'
      - '--web.enable-lifecycle'
      - '--web.external-url=http://localhost/prometheus'
      - '--web.route-prefix=/prometheus'
    restart: unless-stopped
    depends_on:
      - metrics
    networks:
      - internal

  alertmanager:
    image: prom/alertmanager:latest
    container_name: alertmanager-local
    volumes:
      - ./monitoring/alertmanager/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro
      - alertmanager_data:/alertmanager
    environment:
      SLACK_WEBHOOK_URL: ${SLACK_WEBHOOK_URL:-}
    entrypoint: ["/bin/sh", "-c"]
    command:
      - |
        if [ -n "$$SLACK_WEBHOOK_URL" ]; then
          echo "$$SLACK_WEBHOOK_URL" > /tmp/slack_webhook
        else
          echo "https://hooks.slack.com/services/placeholder" > /tmp/slack_webhook
        fi
        exec /bin/alertmanager \
          --config.file=/etc/alertmanager/alertmanager.yml \
          --storage.path=/alertmanager \
          --web.external-url=http://localhost/alertmanager \
          --web.route-prefix=/alertmanager \
          --cluster.listen-address= \
          --log.level=debug
    restart: unless-stopped
    depends_on:
      - prometheus
    networks:
      - internal

  grafana:
    image: grafana/grafana:latest
    container_name: grafana-local
    volumes:
      - grafana_data:/var/lib/grafana
      - ./monitoring/grafana/provisioning/datasources:/etc/grafana/provisioning/datasources:ro
      - ./monitoring/grafana/provisioning/dashboards:/etc/grafana/provisioning/dashboards:ro
      - ./monitoring/grafana/dashboards:/etc/grafana/dashboards:ro
    environment:
      GF_SECURITY_ADMIN_USER: ${GF_SECURITY_ADMIN_USER:-admin}
      GF_SECURITY_ADMIN_PASSWORD: ${GF_SECURITY_ADMIN_PASSWORD:-admin}
      GF_USERS_ALLOW_SIGN_UP: 'false'
      GF_AUTH_ANONYMOUS_ENABLED: 'false'
      GF_SERVER_ROOT_URL: 'http://localhost/grafana/'
      GF_SERVER_SERVE_FROM_SUB_PATH: 'true'
      GF_SECURITY_ALLOW_EMBEDDING: 'true'
      GF_SECURITY_COOKIE_SAMESITE: 'lax'
    restart: unless-stopped
    depends_on:
      - prometheus
    networks:
      - internal

  node-exporter:
    image: prom/node-exporter:latest
    container_name: node-exporter-local
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro
    command:
      - '--path.procfs=/host/proc'
      - '--path.sysfs=/host/sys'
      - '--path.rootfs=/rootfs'
      - '--collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($$|/)'
    restart: unless-stopped
    networks:
      - internal

  metrics:
    image: ghcr.io/virtuos/librechat_exporter:main
    container_name: librechat-metrics
    depends_on:
      - mongodb
    environment:
      MONGODB_URI: mongodb://mongodb:27017/
      MONGODB_DATABASE: LibreChat
      LOGGING_LEVEL: info
      METRICS_CACHE_ENABLED: "true"
      METRICS_CACHE_TTL: "60"
      ENABLE_BASIC_METRICS: "true"
      ENABLE_TOKEN_METRICS: "true"
      ENABLE_USER_METRICS: "true"
      ENABLE_MODEL_METRICS: "true"
      ENABLE_TIME_WINDOW_METRICS: "true"
      ENABLE_RATING_METRICS: "true"
      ENABLE_TOOL_METRICS: "true"
      ENABLE_FILE_METRICS: "true"
    restart: unless-stopped
    networks:
      - internal

volumes:
  weaviate_data:
  sync_data:
  prometheus_data:
  alertmanager_data:
  grafana_data:
```
