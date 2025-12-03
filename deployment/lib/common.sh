#!/bin/bash

log_info() {
  echo "[INFO] $(date '+%Y-%m-%d %H:%M:%S') $*" >&2
}

log_error() {
  echo "[ERROR] $(date '+%Y-%m-%d %H:%M:%S') $*" >&2
}

log_success() {
  echo "[SUCCESS] $(date '+%Y-%m-%d %H:%M:%S') $*" >&2
}

log_warn() {
  echo "[WARN] $(date '+%Y-%m-%d %H:%M:%S') $*" >&2
}

wait_for_port() {
  local host="$1"
  local port="$2"
  local max_attempts="${3:-60}"
  local attempt=1

  while [[ $attempt -le $max_attempts ]]; do
    if (echo > /dev/tcp/"$host"/"$port") >/dev/null 2>&1; then
      return 0
    fi
    log_info "Waiting for $host:$port ($attempt/$max_attempts)..."
    sleep 5
    ((attempt++))
  done

  log_error "Failed to connect to $host:$port after $max_attempts attempts"
  return 1
}

