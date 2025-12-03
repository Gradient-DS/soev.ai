#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

source "$SCRIPT_DIR/lib/common.sh"
source "$SCRIPT_DIR/lib/bootstrap.sh"
source "$SCRIPT_DIR/lib/deploy.sh"
source "$SCRIPT_DIR/lib/certificate.sh"

usage() {
  cat <<EOF
Usage: $0 [OPTIONS]

Deploy soev.ai to the production server.
This script should be run directly on the deployment VM.

Options:
  -d, --domain DOMAIN      Domain name (default: chat.soev.ai)
  -t, --tag TAG            Docker image tag (default: latest)
  -c, --config CONFIG      Config file path (default: librechat.soev.ai.yaml)
  -e, --env-file FILE      Environment variables file (default: .env in repo root)
  -a, --allow-registration Allow user registration (default: true)
  --app-title TITLE        App title (default: soev.ai)
  --skip-bootstrap         Skip VM bootstrap (assumes already bootstrapped)
  --skip-dns               Skip DNS propagation check
  --skip-cert              Skip SSL certificate issuance
  -h, --help               Show this help message

Environment variables can be set in the env file or via command line.
See .env.example for required variables.

Examples:
  $0 -d chat.soev.ai
  $0 -d chat.soev.ai -e custom.env --skip-bootstrap
EOF
  exit 1
}

main() {
  local DOMAIN="chat.soev.ai"
  local TAG_VERSION="latest"
  local CONFIG_PATH="librechat.soev.ai.yaml"
  local ENV_FILE="$PROJECT_ROOT/.env"
  local ALLOW_REGISTRATION="true"
  local APP_TITLE="soev.ai"
  local SKIP_BOOTSTRAP=false
  local SKIP_DNS=false
  local SKIP_CERT=false

  while [[ $# -gt 0 ]]; do
    case $1 in
      -d|--domain)
        DOMAIN="$2"
        shift 2
        ;;
      -t|--tag)
        TAG_VERSION="$2"
        shift 2
        ;;
      -c|--config)
        CONFIG_PATH="$2"
        shift 2
        ;;
      -e|--env-file)
        ENV_FILE="$2"
        shift 2
        ;;
      -a|--allow-registration)
        ALLOW_REGISTRATION="$2"
        shift 2
        ;;
      --app-title)
        APP_TITLE="$2"
        shift 2
        ;;
      --skip-bootstrap)
        SKIP_BOOTSTRAP=true
        shift
        ;;
      --skip-dns)
        SKIP_DNS=true
        shift
        ;;
      --skip-cert)
        SKIP_CERT=true
        shift
        ;;
      -h|--help)
        usage
        ;;
      *)
        echo "Unknown option: $1" >&2
        usage
        ;;
    esac
  done

  if [[ ! -f "$ENV_FILE" ]]; then
    echo "Error: Environment file not found: $ENV_FILE" >&2
    echo "Create one based on .env.example in the repo root" >&2
    exit 1
  fi

  log_info "Detecting external IP addresses..."
  IP=$(curl -s -H "Metadata-Flavor: Google" http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip 2>/dev/null || \
       curl -s ifconfig.me 2>/dev/null || \
       curl -s icanhazip.com 2>/dev/null || \
       curl -s ipinfo.io/ip 2>/dev/null || \
       echo "")
  if [[ -z "$IP" ]]; then
    log_error "Failed to detect external IPv4 address"
    exit 1
  fi
  
  IPV6=$(curl -s -H "Metadata-Flavor: Google" http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/ipv6s 2>/dev/null | head -n1 || \
         curl -s -6 ifconfig.me 2>/dev/null || \
         curl -s -6 icanhazip.com 2>/dev/null || \
         curl -s ipv6.icanhazip.com 2>/dev/null || \
         echo "")
  
  if [[ -n "$IPV6" ]]; then
    log_info "Detected external IPv4: $IP, IPv6: $IPV6"
  else
    log_info "Detected external IPv4: $IP (no IPv6 detected)"
  fi
  log_info "Starting deployment on local VM for domain $DOMAIN"
  log_info "Image tag: $TAG_VERSION"
  log_info "Config: $CONFIG_PATH"

  export IP IPV6 DOMAIN TAG_VERSION CONFIG_PATH ALLOW_REGISTRATION APP_TITLE
  export SKIP_BOOTSTRAP SKIP_DNS SKIP_CERT

  source "$ENV_FILE"

  if [[ "$SKIP_BOOTSTRAP" != "true" ]]; then
    log_info "Bootstraping production VM..."
    bootstrap_production_vm
  else
    log_info "Skipping VM bootstrap (--skip-bootstrap)"
  fi

  log_info "Preparing deployment bundle..."
  prepare_bundle "$PROJECT_ROOT" "$CONFIG_PATH"

  log_info "Setting up deployment bundle and environment..."
  setup_bundle_and_env "$PROJECT_ROOT" "$CONFIG_PATH"

  log_info "Authenticating to GHCR..."
  authenticate_ghcr

  log_info "Starting application stack..."
  start_application_stack

  if [[ "$SKIP_DNS" != "true" ]]; then
    log_info "Waiting for DNS propagation..."
    wait_for_dns "$DOMAIN" "$IP" "${IPV6:-}"
  else
    log_info "Skipping DNS check (--skip-dns)"
  fi

  if [[ "$SKIP_CERT" != "true" ]]; then
    log_info "Configuring SSL certificate..."
    configure_ssl_certificate "$DOMAIN"
  else
    log_info "Skipping SSL certificate (--skip-cert)"
  fi

  log_info "Running smoke tests..."
  run_smoke_tests "$DOMAIN"

  log_info "Collecting container logs..."
  collect_logs

  log_success "Deployment completed successfully!"
  log_info "Application available at: https://$DOMAIN"
}

main "$@"

