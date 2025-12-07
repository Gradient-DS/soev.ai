# Airweave SharePoint/OneDrive Setup Guide

This guide explains how to configure Airweave to index documents from SharePoint or OneDrive using Microsoft Entra ID (Azure AD) app-only authentication.

## Prerequisites

- Microsoft 365 tenant with admin access
- Docker and Docker Compose installed
- Airweave stack running (see docker-compose.staging.yml)

---

## Part 1: Create a SharePoint Site (Recommended for Demo)

For demo purposes, a SharePoint site is easier to manage than OneDrive personal storage.

1. Go to [SharePoint Admin Center](https://admin.microsoft.com/sharepoint)
2. Click **Sites** → **Active sites** → **Create**
3. Choose **Team site** (or Communication site)
4. Name it something like "Airweave Demo"
5. Set privacy to **Private** (only members can access)
6. Create the site

### Upload Demo Documents

1. Navigate to your new site
2. Go to **Documents** library
3. Upload your demo files (PDFs, Word docs, etc.)
4. Note the site URL: `https://yourtenant.sharepoint.com/sites/AirweaveDemo`

---

## Part 2: Register Microsoft Entra ID Application

### Step 1: Create App Registration

1. Go to [Microsoft Entra admin center](https://entra.microsoft.com)
2. Navigate to **Applications** → **App registrations**
3. Click **New registration**
4. Configure:
   - **Name**: `Airweave SharePoint Connector`
   - **Supported account types**: `Accounts in this organizational directory only` (Single tenant)
   - **Redirect URI**: Leave blank (not needed for app-only auth)
5. Click **Register**

### Step 2: Configure API Permissions

1. In your app registration, go to **API permissions**
2. Click **Add a permission** → **Microsoft Graph**
3. Select **Application permissions** (NOT Delegated)
4. Add these permissions:

| Permission | Purpose |
|------------|---------|
| `Sites.Read.All` | Read all SharePoint sites |
| `Files.Read.All` | Read all files (for OneDrive) |

**For more restrictive access** (production recommended):
- Use `Sites.Selected` instead of `Sites.Read.All`
- This requires additional configuration to grant access to specific sites only

5. Click **Grant admin consent for [Your Tenant]**
6. Confirm the status shows green checkmarks

### Step 3: Create Client Secret

1. Go to **Certificates & secrets**
2. Click **Client secrets** → **New client secret**
3. Add a description: `Airweave Production`
4. Choose expiration (recommended: 24 months)
5. Click **Add**
6. **IMMEDIATELY copy the secret value** (it won't be shown again)
7. Store as `AZURE_CLIENT_SECRET` in your `.env` file

### Step 4: Get Application IDs

From the **Overview** page, copy:

| Field | Environment Variable |
|-------|---------------------|
| Application (client) ID | `AZURE_CLIENT_ID` |
| Directory (tenant) ID | `AZURE_TENANT_ID` |

---

## Part 3: Configure Environment Variables

Add these to your `.env` file:

```bash
# ==============================================
# Airweave Configuration
# ==============================================

# Generate secrets (run these commands):
# openssl rand -base64 32   # for AIRWEAVE_ENCRYPTION_KEY
# openssl rand -base64 32   # for AIRWEAVE_STATE_SECRET

AIRWEAVE_ENCRYPTION_KEY=your-base64-encryption-key
AIRWEAVE_STATE_SECRET=your-base64-state-secret
AIRWEAVE_DB_PASSWORD=airweave

# These are set AFTER initial Airweave setup (Part 4)
AIRWEAVE_API_KEY=
AIRWEAVE_COLLECTION_ID=

# Custom embeddings endpoint (OpenAI-compatible API)
# Use your own embedding service instead of OpenAI
AIRWEAVE_EMBEDDINGS_API_KEY=your-embeddings-api-key
AIRWEAVE_EMBEDDINGS_BASE_URL=https://your-embeddings-endpoint.com/v1
AIRWEAVE_EMBEDDINGS_MODEL=text-embedding-3-small

# Microsoft Entra ID (from Part 2)
AZURE_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_CLIENT_SECRET=your-client-secret-value
```

---

## Part 4: Start Airweave and Configure via API

### Start the Services

```bash
docker compose -f docker-compose.staging.yml up -d airweave-db airweave-qdrant airweave-redis airweave-temporal airweave-backend
```

Wait for services to be healthy:
```bash
docker compose -f docker-compose.staging.yml logs -f airweave-backend
```

### Verify Airweave is Running

```bash
curl http://localhost:8001/health
# Should return: {"status":"healthy"}
```

### Create an API Key

```bash
# Create a new API key (save the response!)
curl -X POST http://localhost:8001/api-keys \
  -H "Content-Type: application/json" \
  -d '{"name": "LibreChat Integration"}'
```

Response:
```json
{
  "id": "...",
  "key": "aw_xxxxxxxxxxxxxxxxxxxx",
  "name": "LibreChat Integration"
}
```

**Save the `key` value as `AIRWEAVE_API_KEY` in your `.env` file.**

### Create a Collection

```bash
curl -X POST http://localhost:8001/collections \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${AIRWEAVE_API_KEY}" \
  -d '{"name": "SharePoint Demo"}'
```

Response:
```json
{
  "id": "...",
  "readable_id": "sharepoint-demo-abc123",
  "name": "SharePoint Demo"
}
```

**Save the `readable_id` as `AIRWEAVE_COLLECTION_ID` in your `.env` file.**

### Add SharePoint Source Connection

```bash
curl -X POST http://localhost:8001/source-connections \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${AIRWEAVE_API_KEY}" \
  -d "{
    \"name\": \"SharePoint Demo Site\",
    \"short_name\": \"sharepoint\",
    \"readable_collection_id\": \"${AIRWEAVE_COLLECTION_ID}\",
    \"authentication\": {
      \"client_id\": \"${AZURE_CLIENT_ID}\",
      \"client_secret\": \"${AZURE_CLIENT_SECRET}\",
      \"tenant_id\": \"${AZURE_TENANT_ID}\"
    },
    \"config\": {
      \"site_url\": \"${SHAREPOINT_URL}\"
    }
  }"
```


### Trigger Initial Sync

```bash
# Get the connection ID from the previous response
curl -X POST http://localhost:8001/source-connections/${SHAREPOINT_CONNECTION_ID}/run \
  -H "Authorization: Bearer ${AIRWEAVE_API_KEY}"
```

### Monitor Sync Progress

```bash
curl http://localhost:8001/source-connections/${SHAREPOINT_CONNECTION_ID} \
  -H "Authorization: Bearer ${AIRWEAVE_API_KEY}"
```

### Cancel a pending job
```bash
curl -X POST http://localhost:8001/source-connections/${SHAREPOINT_CONNECTION_ID}/jobs/${JOB_ID}/cancel \
  -H "Authorization: Bearer ${AIRWEAVE_API_KEY}"
```

### Delete a source connection
```bash
curl -X DELETE http://localhost:8001/source-connections/${SHAREPOINT_CONNECTION_ID} \
  -H "Authorization: Bearer ${AIRWEAVE_API_KEY}"
```

### Delete a collection
```bash
curl -X DELETE http://localhost:8001/collections/${AIRWEAVE_COLLECTION_ID} \
  -H "Authorization: Bearer ${AIRWEAVE_API_KEY}"
```

**Note:** Deleting a collection will also delete all associated source connections and synced data. You may need to recreate the collection if you change embedding models (different models produce different vector dimensions).
---

## Part 5: Test the Integration

### Test Airweave Search Directly

```bash
curl -X POST http://localhost:8001/api/collections/YOUR_COLLECTION_READABLE_ID/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${AIRWEAVE_API_KEY}" \
  -d '{"query": "your search query here"}'
```

### Test via LibreChat

1. Restart LibreChat to pick up the new MCP configuration:
   ```bash
   docker compose -f docker-compose.staging.yml restart librechat_api
   ```

2. In LibreChat:
   - Start a new chat
   - Select the "Airweave" MCP server from the menu
   - Ask a question about your documents

---

## Troubleshooting

### "Invalid client credentials" Error

- Verify `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_CLIENT_SECRET` are correct
- Check that admin consent was granted for the API permissions
- Ensure the client secret hasn't expired

### "Access denied" to SharePoint Site

- Verify `Sites.Read.All` permission is granted with admin consent
- For `Sites.Selected`, ensure the specific site was granted access

### Sync Not Finding Documents

- Check the site URL is correct (including `/sites/` path)
- Verify documents are in the Documents library (not a subfolder with different permissions)
- Check Airweave logs: `docker compose logs airweave-backend`

### MCP Server Not Connecting

- Verify Airweave is running: `curl http://localhost:8001/health`
- Check `AIRWEAVE_API_KEY` and `AIRWEAVE_COLLECTION_ID` are set in `.env`
- Restart LibreChat after changing environment variables

---

## Security Considerations

### Production Recommendations

1. **Use `Sites.Selected` Permission**: Instead of `Sites.Read.All`, use `Sites.Selected` and explicitly grant access to specific sites only.

2. **Certificate Authentication**: For production, consider using certificate-based authentication instead of client secrets.

3. **Rotate Secrets**: Set up a process to rotate client secrets before expiration.

4. **Network Security**: In production, ensure Airweave is not exposed publicly. Use internal Docker networks only.

5. **Audit Logging**: Enable audit logging in Microsoft Entra to track application access.

---

## API Reference

### Airweave Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/collections` | POST | Create collection |
| `/api/collections` | GET | List collections |
| `/api/collections/{id}/search` | POST | Search documents |
| `/api/source-connections` | POST | Create source connection |
| `/api/source-connections/{id}/sync` | POST | Trigger sync |
| `/api/api-keys` | POST | Create API key |
| `/health` | GET | Health check |

Full API documentation: http://localhost:8001/docs
