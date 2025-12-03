#!/bin/bash

prepare_bundle() {
  local project_root="$1"
  local config_path="$2"
  local bundle_dir="$project_root/deployment/bundle"

  log_info "Creating deployment bundle..."
  mkdir -p "$bundle_dir"

  if [[ ! -f "$project_root/deploy-compose.soev.ai.yml" ]]; then
    log_error "deploy-compose.soev.ai.yml not found"
    exit 1
  fi

  if [[ ! -f "$project_root/$config_path" ]]; then
    log_error "Config file not found: $config_path"
    exit 1
  fi

  tar -czf "$bundle_dir/deploy.tar.gz" \
    -C "$project_root" \
    deploy-compose.soev.ai.yml \
    nginx/nginx-prod.conf \
    nginx/nginx-acme.conf \
    nginx/nginx.tmpl.conf \
    monitoring/prometheus/prometheus-prod.yml \
    monitoring/prometheus/alerts.yml \
    monitoring/alertmanager/alertmanager.yml \
    monitoring/grafana/provisioning \
    monitoring/grafana/dashboards \
    "$config_path"

  log_success "Bundle created: $bundle_dir/deploy.tar.gz"
}

setup_bundle_and_env() {
  local project_root="$1"
  local config_path="$2"

  log_info "Generating environment file..."

  local env_file="$HOME/.remote.env"
  {
    printf 'FQDN=%q\n' "$DOMAIN"
    printf 'IP=%q\n' "$IP"
    printf 'LIBRECHAT_TAG=%q\n' "$TAG_VERSION"
    printf 'GH_PAT=%q\n' "${GH_PAT:-}"
    printf 'GHCR_USERNAME=%q\n' "${GHCR_USERNAME:-}"
    printf 'CONFIG_PATH=%q\n' "$config_path"
    printf 'HF_KEY=%q\n' "${HF_KEY:-}"
    printf 'GRADIENT_MAIL=%q\n' "${GRADIENT_MAIL:-}"
    printf 'GKN_API_KEY=%q\n' "${GKN_API_KEY:-}"
    printf 'OPENAI_API_KEY=%q\n' "${OPENAI_API_KEY:-}"
    printf 'CREDS_KEY=%q\n' "${CREDS_KEY:-}"
    printf 'CREDS_IV=%q\n' "${CREDS_IV:-}"
    printf 'JWT_SECRET=%q\n' "${JWT_SECRET:-}"
    printf 'JWT_REFRESH_SECRET=%q\n' "${JWT_REFRESH_SECRET:-}"
    printf 'RAG_OPENAI_API_KEY=%q\n' "${RAG_OPENAI_API_KEY:-}"
    printf 'RAG_API_URL=%q\n' "${RAG_API_URL:-}"
    printf 'ALLOW_REGISTRATION=%q\n' "$ALLOW_REGISTRATION"
    printf 'ALLOW_EMAIL_LOGIN=%q\n' "${ALLOW_EMAIL_LOGIN:-}"
    printf 'ALLOW_UNVERIFIED_EMAIL_LOGIN=%q\n' "${ALLOW_UNVERIFIED_EMAIL_LOGIN:-}"
    printf '%s=%s\n' "EMAIL_FROM" "\"${EMAIL_FROM:-}\""
    printf 'SMTP_HOST=%q\n' "${SMTP_HOST:-}"
    printf 'SMTP_PORT=%q\n' "${SMTP_PORT:-}"
    printf 'SMTP_USER=%q\n' "${SMTP_USER:-}"
    printf 'SMTP_SECURE=%q\n' "${SMTP_SECURE:-}"
    printf 'SMTP_PASSWORD=%q\n' "${SMTP_PASSWORD:-}"
    printf 'APP_TITLE=%q\n' "$APP_TITLE"
    printf 'SERPER_API_KEY=%q\n' "${SERPER_API_KEY:-}"
    printf 'WEBSEARCH_SEARCH_PROVIDER=%q\n' "${WEBSEARCH_SEARCH_PROVIDER:-}"
    printf 'FIRECRAWL_API_KEY=%q\n' "${FIRECRAWL_API_KEY:-}"
    printf 'COHERE_API_KEY=%q\n' "${COHERE_API_KEY:-}"
    printf 'MEILI_MASTER_KEY=%q\n' "${MEILI_MASTER_KEY:-}"
    printf 'DOMAIN_CLIENT=%q\n' "https://$DOMAIN"
    printf 'DOMAIN_SERVER=%q\n' "https://$DOMAIN"
    printf 'TRUST_PROXY=%q\n' "1"
    printf '%s=%s\n' "ENDPOINTS" "${ENDPOINTS:-}"
    # OpenID/SSO Configuration
    printf 'OPENID_CLIENT_ID=%q\n' "${OPENID_CLIENT_ID:-}"
    printf 'OPENID_CLIENT_SECRET=%q\n' "${OPENID_CLIENT_SECRET:-}"
    printf 'OPENID_ISSUER=%q\n' "${OPENID_ISSUER:-}"
    printf 'OPENID_SESSION_SECRET=%q\n' "${OPENID_SESSION_SECRET:-}"
    printf 'OPENID_CALLBACK_URL=%q\n' "${OPENID_CALLBACK_URL:-/oauth/openid/callback}"
    printf '%s="%s"\n' "OPENID_SCOPE" "${OPENID_SCOPE:-openid profile email}"
    printf '%s="%s"\n' "OPENID_BUTTON_LABEL" "${OPENID_BUTTON_LABEL:-Login met Microsoft}"
    printf 'OPENID_REQUIRED_ROLE_TOKEN_KIND=%q\n' "${OPENID_REQUIRED_ROLE_TOKEN_KIND:-id}"
    printf 'ALLOW_SOCIAL_LOGIN=%q\n' "${ALLOW_SOCIAL_LOGIN:-true}"
    # UbiOps/Nebul Configuration
    printf 'UBIOPS_KEY=%q\n' "${UBIOPS_KEY:-}"
    printf 'UBIOPS_RAG=%q\n' "${UBIOPS_RAG:-}"
    printf 'NEBUL_API_KEY=%q\n' "${NEBUL_API_KEY:-}"
    # RAG Configuration
    printf 'RAG_OPENAI_BASE_URL=%q\n' "${RAG_OPENAI_BASE_URL:-}"
    printf 'RAG_EMBEDDINGS_MODEL=%q\n' "${RAG_EMBEDDINGS_MODEL:-}"
    # Web Search Configuration
    printf 'SEARXNG_INSTANCE_URL=%q\n' "${SEARXNG_INSTANCE_URL:-}"
    printf 'FIRECRAWL_API_URL=%q\n' "${FIRECRAWL_API_URL:-}"
    printf 'JINA_API_URL=%q\n' "${JINA_API_URL:-}"
    printf 'JINA_API_KEY=%q\n' "${JINA_API_KEY:-}"
    # Monitoring Configuration
    printf 'GF_SECURITY_ADMIN_USER=%q\n' "${GF_SECURITY_ADMIN_USER:-admin}"
    printf 'GF_SECURITY_ADMIN_PASSWORD=%q\n' "${GF_SECURITY_ADMIN_PASSWORD:-}"
    printf 'SLACK_WEBHOOK_URL=%q\n' "${SLACK_WEBHOOK_URL:-}"
  } > "$env_file"

  log_info "Copying bundle to deployment directory..."
  mkdir -p "$HOME/soevai"
  cp "$project_root/deployment/bundle/deploy.tar.gz" "$HOME/deploy.tar.gz"

  log_success "Bundle and environment setup complete"
}

authenticate_ghcr() {
  set -euo pipefail
  [ -f "$HOME/.remote.env" ] && . "$HOME/.remote.env" || true
  USERNAME="${GHCR_USERNAME:-${GITHUB_ACTOR:-}}"
  TOKEN="${GH_PAT:-}"
  if [ -z "$TOKEN" ]; then
    log_error "GH_PAT not set; cannot login to GHCR."
    exit 1
  fi
  mkdir -p "$HOME/.docker" && chmod 700 "$HOME/.docker"
  docker logout ghcr.io >/dev/null 2>&1 || true
  echo "$TOKEN" | docker login ghcr.io -u "$USERNAME" --password-stdin
  log_info "Logged into GHCR as $USERNAME (deploy)"
  sudo mkdir -p /root/.docker && sudo chmod 700 /root/.docker
  sudo docker logout ghcr.io >/dev/null 2>&1 || true
  echo "$TOKEN" | sudo docker login ghcr.io -u "$USERNAME" --password-stdin
  log_info "Logged into GHCR as $USERNAME (root)"
  log_success "GHCR authentication completed"
}

start_application_stack() {
  set -euo pipefail
  mkdir -p "$HOME/soevai" && cd "$HOME/soevai"
  tar -xzf "$HOME/deploy.tar.gz"
  . "$HOME/.remote.env" || true
  export HOST=0.0.0.0
  export PORT=3080
  export DOMAIN_CLIENT="https://$FQDN"
  export DOMAIN_SERVER="https://$FQDN"
  export TRUST_PROXY=1
  export ALLOW_REGISTRATION=true
  export ALLOW_UNVERIFIED_EMAIL_LOGIN=true

  # Create SSL helper files before starting nginx (prevents crash on first deploy)
  log_info "Ensuring SSL helper files exist..."
  sudo mkdir -p /srv/soevai/letsencrypt/live/$FQDN /srv/soevai/certbot-www
  if [ ! -f /srv/soevai/letsencrypt/options-ssl-nginx.conf ]; then
    log_info "Creating options-ssl-nginx.conf..."
    sudo tee /srv/soevai/letsencrypt/options-ssl-nginx.conf >/dev/null <<'EOF'
ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers off;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
ssl_session_timeout 1d;
ssl_session_cache shared:SSL:10m;
ssl_session_tickets off;
EOF
  fi
  if [ ! -f /srv/soevai/letsencrypt/ssl-dhparams.pem ]; then
    log_info "Generating DH parameters (this may take a moment)..."
    sudo openssl dhparam -out /srv/soevai/letsencrypt/ssl-dhparams.pem 2048
  fi
  # Create self-signed placeholder certificate if no real cert exists (allows nginx to start)
  if [ ! -f "/srv/soevai/letsencrypt/live/$FQDN/fullchain.pem" ]; then
    log_info "Creating self-signed placeholder certificate for $FQDN..."
    sudo openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
      -keyout "/srv/soevai/letsencrypt/live/$FQDN/privkey.pem" \
      -out "/srv/soevai/letsencrypt/live/$FQDN/fullchain.pem" \
      -subj "/CN=$FQDN" 2>/dev/null
    log_info "Placeholder certificate created (will be replaced by Let's Encrypt)"
  fi

  # Process nginx template with actual domain name
  log_info "Configuring nginx for domain $FQDN..."
  sed "s/SERVER_NAME_PLACEHOLDER/$FQDN/g" nginx/nginx.tmpl.conf > nginx/nginx-prod.conf

  # Stop existing containers (preserves volumes and data)
  sudo docker compose --env-file "$HOME/.remote.env" -f deploy-compose.soev.ai.yml down 2>/dev/null || true
  sudo docker compose --env-file "$HOME/.remote.env" -f deploy-compose.soev.ai.yml pull | cat
  sudo docker compose --env-file "$HOME/.remote.env" -f deploy-compose.soev.ai.yml up -d | cat
  log_success "Application stack started"
}

wait_for_dns() {
  local fqdn="$1"
  local ip="$2"
  local ipv6="${3:-}"

  for resolver in 1.1.1.1 8.8.8.8 9.9.9.9; do
    log_info "Checking resolver $resolver for $fqdn -> $ip (A record)"
    ok=""
    for i in {1..60}; do
      resolved=$(dig +short A "$fqdn" @"$resolver" | tail -n1 || true)
      if [ "$resolved" = "$ip" ]; then
        ok=1
        break
      fi
      log_info "  waiting DNS A record ($i/60): got '$resolved'"
      sleep 5
    done
    if [ -z "$ok" ]; then
      log_error "Resolver $resolver does not return $ip for $fqdn (A record)"
      exit 1
    fi
  done
  
  if [[ -n "$ipv6" ]]; then
    # Normalize expected IPv6 to compressed format for comparison
    local ipv6_normalized
    ipv6_normalized=$(python3 -c "import ipaddress; print(ipaddress.ip_address('$ipv6').compressed)" 2>/dev/null || echo "$ipv6")
    
    for resolver in 1.1.1.1 8.8.8.8 9.9.9.9; do
      log_info "Checking resolver $resolver for $fqdn -> $ipv6_normalized (AAAA record)"
      ok=""
      for i in {1..60}; do
        resolved=$(dig +short AAAA "$fqdn" @"$resolver" | tail -n1 || true)
        # Normalize resolved IPv6 for comparison
        if [[ -n "$resolved" ]]; then
          resolved_normalized=$(python3 -c "import ipaddress; print(ipaddress.ip_address('$resolved').compressed)" 2>/dev/null || echo "$resolved")
        else
          resolved_normalized=""
        fi
        if [ "$resolved_normalized" = "$ipv6_normalized" ]; then
          ok=1
          break
        fi
        log_info "  waiting DNS AAAA record ($i/60): got '$resolved'"
        sleep 5
      done
      if [ -z "$ok" ]; then
        log_warn "Resolver $resolver does not return $ipv6_normalized for $fqdn (AAAA record) - continuing anyway"
      fi
    done
  fi
  
  log_success "DNS propagation confirmed"
}

run_smoke_tests() {
  local fqdn="$1"

  # Use -k (insecure) if --skip-cert was used or cert is self-signed
  local curl_opts=""
  if [[ "$SKIP_CERT" == "true" ]]; then
    curl_opts="-k"
    log_info "Running smoke tests on https://$fqdn... (allowing self-signed cert)"
  else
    log_info "Running smoke tests on https://$fqdn..."
  fi

  for i in {1..60}; do
    code=$(curl -sS $curl_opts -o /dev/null -w "%{http_code}" "https://$fqdn/" || echo "000")
    if [ "$code" -ge 200 ] && [ "$code" -lt 500 ]; then
      break
    fi
    log_info "Waiting for HTTPS ($i/60)..."
    sleep 2
  done

  if ! curl -fsS $curl_opts "https://$fqdn/" >/dev/null; then
    log_error "Smoke test failed"
    exit 1
  fi

  log_success "Smoke tests passed"
}

collect_logs() {
  set -euo pipefail
  cd "$HOME/soevai"
  echo "=== docker compose ps ==="; sudo docker compose -f deploy-compose.soev.ai.yml ps | cat
  echo
  echo "=== API logs: librechat_api (last 300) ==="; sudo docker logs --tail=300 librechat_api || true
  echo
  echo "=== Nginx logs: nginx-soevai (last 200) ==="; sudo docker logs --tail=200 nginx-soevai || true
  echo
  echo "=== Mongo logs: chat-mongodb (last 100) ==="; sudo docker logs --tail=100 chat-mongodb || true
  echo
  echo "=== Meilisearch logs: chat-meilisearch (last 100) ==="; sudo docker logs --tail=100 chat-meilisearch || true
  echo
  echo "=== Certbot logs: certbot-soevai (last 100) ==="; sudo docker logs --tail=100 certbot-soevai || true
  echo
  echo "=== VectorDB logs: soevai-vectordb-1 (last 100) ==="; sudo docker logs --tail=100 soevai-vectordb-1 || true
  echo
  echo "=== RAG API logs: soevai-rag_api-1 (last 100) ==="; sudo docker logs --tail=100 soevai-rag_api-1 || true
  echo
  echo "=== All compose logs (last 200, all services) ==="; sudo docker compose -f deploy-compose.soev.ai.yml logs --no-color --tail=200 | cat || true
}

