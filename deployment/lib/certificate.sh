#!/bin/bash

# Reference deployment paths (must match deploy.sh)
DEPLOY_ROOT="/srv/soevai"
CONFIG_DIR="$DEPLOY_ROOT/config"
SECRETS_DIR="$DEPLOY_ROOT/secrets"

configure_ssl_certificate() {
  local fqdn="$1"

  if [[ -z "${GRADIENT_MAIL:-}" ]]; then
    log_warn "GRADIENT_MAIL not set; skipping certificate issuance"
    return 0
  fi

  set -euo pipefail
  cd "$CONFIG_DIR"
  . "$HOME/.remote.env" || true

  log_info "Requesting SSL certificate for $fqdn (email: $GRADIENT_MAIL)"
  log_info "Working directory: $(pwd)"
  log_info "FQDN from env: $FQDN"

  # Verify required files exist
  if [[ ! -f "nginx/nginx-acme.conf" ]]; then
    log_error "nginx/nginx-acme.conf not found in $(pwd)"
    ls -la nginx/ || log_error "nginx/ directory does not exist"
    return 1
  fi

  # 1) ACME bootstrap config (HTTP only)
  log_info "Configuring nginx for ACME challenge..."
  sed "s/SERVER_NAME_PLACEHOLDER/$FQDN/g" nginx/nginx-acme.conf > /tmp/nginx-default.conf

  # Write in-place instead of docker cp (works with bind mounts)
  sudo docker exec -i nginx-soevai sh -c 'cat > /etc/nginx/conf.d/default.conf' < /tmp/nginx-default.conf
  sudo docker exec nginx-soevai nginx -t
  sudo docker exec nginx-soevai nginx -s reload

  # Wait until HTTP is actually answering
  for i in $(seq 1 60); do
    if curl -fsS "http://$FQDN/" >/dev/null 2>&1; then break; fi
    sleep 2
  done

  # 2) Issue certificate via webroot
  sudo mkdir -p "$SECRETS_DIR/letsencrypt" "$SECRETS_DIR/certbot-www" "$SECRETS_DIR/letsencrypt-log"

  # Remove placeholder/self-signed cert if it exists (allows certbot to create real cert)
  if [ -d "$SECRETS_DIR/letsencrypt/live/$FQDN" ]; then
    # Check if it's a self-signed placeholder (issuer = subject)
    if sudo openssl x509 -in "$SECRETS_DIR/letsencrypt/live/$FQDN/fullchain.pem" -noout -issuer 2>/dev/null | grep -q "CN = $FQDN"; then
      log_info "Removing self-signed placeholder certificate..."
      sudo rm -rf "$SECRETS_DIR/letsencrypt/live/$FQDN"
      sudo rm -rf "$SECRETS_DIR/letsencrypt/archive/$FQDN"
      sudo rm -f "$SECRETS_DIR/letsencrypt/renewal/$FQDN.conf"
    fi
  fi

  sudo docker run --rm \
    -v "$SECRETS_DIR/letsencrypt:/etc/letsencrypt" \
    -v "$SECRETS_DIR/certbot-www:/var/www/certbot" \
    -v "$SECRETS_DIR/letsencrypt-log:/var/log/letsencrypt" \
    certbot/certbot:latest certonly --webroot \
      -w /var/www/certbot -d "$FQDN" \
      --agree-tos --email "$GRADIENT_MAIL" --non-interactive -v

  sudo ls -l "$SECRETS_DIR/letsencrypt/live/$FQDN/fullchain.pem" "$SECRETS_DIR/letsencrypt/live/$FQDN/privkey.pem"

  # Wait for API to be ready before switching to TLS
  log_info "Waiting for API health (host 127.0.0.1:3080) ..."
  ok=""
  for i in $(seq 1 120); do
    code=$(curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:3080/health || true)
    if [ "$code" = "200" ]; then ok=1; break; fi
    sleep 2
  done
  if [ -z "$ok" ]; then
    log_warn "API health not ready on host after waiting; checking from nginx container ..."
    sudo docker exec nginx-soevai sh -lc 'apk add --no-cache curl >/dev/null 2>&1 || true; curl -sS -o /dev/null -w "%{http_code}" http://api:3080/health || true'
  fi

  # Ensure TLS helper files exist on host (visible in container via bind mount)
  if [ ! -f "$SECRETS_DIR/letsencrypt/options-ssl-nginx.conf" ]; then
    sudo tee "$SECRETS_DIR/letsencrypt/options-ssl-nginx.conf" >/dev/null <<'EOF'
ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers off;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
ssl_session_timeout 1d;
ssl_session_cache shared:SSL:10m;
ssl_session_tickets off;
EOF
  fi
  if [ ! -f "$SECRETS_DIR/letsencrypt/ssl-dhparams.pem" ]; then
    sudo openssl dhparam -out "$SECRETS_DIR/letsencrypt/ssl-dhparams.pem" 2048
  fi

  # 3) Switch to TLS config and reload
  sed "s/SERVER_NAME_PLACEHOLDER/$FQDN/g" nginx/nginx.tmpl.conf > /tmp/nginx-default.conf
  sudo docker exec -i nginx-soevai sh -c 'cat > /etc/nginx/conf.d/default.conf' < /tmp/nginx-default.conf
  sudo docker exec nginx-soevai nginx -t
  sudo docker exec nginx-soevai nginx -s reload

  log_success "SSL certificate configured"
}
