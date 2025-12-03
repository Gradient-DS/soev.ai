#!/bin/bash

bootstrap_production_vm() {
  set -euo pipefail
  export DEBIAN_FRONTEND=noninteractive

  sudon() { sudo -n "$@"; }

TMP_SUDOERS=$(mktemp)
cat > "$TMP_SUDOERS" <<'SUDOERS'
Defaults:deploy secure_path="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
deploy ALL=(ALL) NOPASSWD: \
  /usr/bin/docker, \
  /usr/bin/systemctl, \
  /usr/bin/journalctl, \
  /usr/bin/apt-get, \
  /usr/bin/apt, \
  /usr/sbin/usermod, \
  /usr/sbin/ufw, \
  /usr/sbin/visudo, \
  /usr/bin/install, \
  /bin/mkdir, /usr/bin/mkdir, \
  /bin/chmod, /usr/bin/chmod, \
  /bin/chown, /usr/bin/chown, \
  /usr/bin/curl, \
  /usr/bin/tar, \
  /usr/bin/tee, \
  /usr/bin/tail, \
  /usr/bin/cloud-init, \
  /bin/cp, /usr/bin/cp, \
  /bin/ls, /usr/bin/ls, \
  /usr/bin/stat, \
  /usr/bin/test, \
  /usr/bin/openssl, \
  /usr/bin/sed
SUDOERS
sudon visudo -cf "$TMP_SUDOERS"
sudon install -m 0440 "$TMP_SUDOERS" /etc/sudoers.d/90-deploy
sudon chown root:root /etc/sudoers.d/90-deploy
rm -f "$TMP_SUDOERS"

set +e
ok=""
for i in {1..30}; do
  if sudon apt-get update -y && sudon apt-get install -y ca-certificates curl git python3 python3-pip docker.io ufw fail2ban unattended-upgrades auditd; then
    ok=1; break; fi
  echo "[keepalive] apt busy; retry $i/30"; sleep 5
done
set -e
if [ -z "$ok" ]; then echo "apt install failed after retries" >&2; exit 1; fi

if ! docker compose version >/dev/null 2>&1; then
  sudon mkdir -p /usr/lib/docker/cli-plugins
  sudon curl -sSL -o /usr/lib/docker/cli-plugins/docker-compose \
    https://github.com/docker/compose/releases/download/v2.39.1/docker-compose-linux-x86_64
  sudon chmod +x /usr/lib/docker/cli-plugins/docker-compose
fi
sudon usermod -aG docker deploy || true

sudon mkdir -p /etc/ssh/sshd_config.d
TS="/etc/ssh/sshd_config.d/01-hardening.conf"
TMP_SSH=$(mktemp)
cat > "$TMP_SSH" <<'SSHDROPIN'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
X11Forwarding no
UseDNS no
AllowUsers deploy
SSHDROPIN
if ! cmp -s "$TMP_SSH" "$TS" 2>/dev/null; then
  sudon install -m 0644 "$TMP_SSH" "$TS"
  sudon systemctl reload ssh || sudon systemctl reload sshd || true
fi
rm -f "$TMP_SSH"

sudon install -d -m 0775 -o deploy -g deploy \
  /srv/soevai/letsencrypt \
  /srv/soevai/certbot-www \
  /srv/soevai/letsencrypt-log

sudon ufw --force reset || true
sudon ufw default deny incoming
sudon ufw default allow outgoing
sudon ufw limit 22/tcp
sudon ufw allow 80/tcp
sudon ufw allow 443/tcp
sudon ufw --force enable

sudon systemctl enable --now docker || true
sudon systemctl enable --now fail2ban || true
sudon systemctl enable --now auditd || true
echo 'APT::Periodic::Update-Package-Lists "1";'          | sudon tee /etc/apt/apt.conf.d/20auto-upgrades >/dev/null
echo 'APT::Periodic::Download-Upgradeable-Packages "1";' | sudon tee -a /etc/apt/apt.conf.d/20auto-upgrades >/dev/null
echo 'APT::Periodic::AutocleanInterval "7";'             | sudon tee -a /etc/apt/apt.conf.d/20auto-upgrades >/dev/null
echo 'APT::Periodic::Unattended-Upgrade "1";'            | sudon tee -a /etc/apt/apt.conf.d/20auto-upgrades >/dev/null
sudon systemctl enable --now unattended-upgrades || true

sudon visudo -cf /etc/sudoers.d/90-deploy
echo "Production VM bootstrapped successfully."

  log_success "Production VM bootstrap completed"
}

