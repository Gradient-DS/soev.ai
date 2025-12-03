#!/bin/bash

wait_for_ssh() {
  local ip="$1"
  local key="$2"
  wait_for_port "$ip" 22 60
}

select_ssh_user() {
  local ip="$1"
  local key="$2"

  try_user() {
    local user="$1"
    log_info "Trying SSH as '$user'..."
    if ssh -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=5 -i "$key" "$user@$ip" "echo ok" >/dev/null 2>&1; then
      log_info "SSH connection successful as '$user'"
      return 0
    else
      return 1
    fi
  }

  if try_user "root"; then
    echo "root"
    return 0
  fi

  if try_user "deploy"; then
    echo "deploy"
    return 0
  fi

  log_error "No suitable SSH user found (tried root, deploy)"
  exit 1
}

