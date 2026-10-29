#!/usr/bin/env bash
# Uploads deploy/out/ to the server and restarts the API.  usage: deploy/push.sh user@host [https://domain]
set -euo pipefail
HOST="${1:?usage: deploy/push.sh user@host [https://domain]}"
cd "$(dirname "$0")/.."
test -f deploy/out/metamorph-api && test -f deploy/out/web.tar.gz || { echo "run deploy/build.sh first" >&2; exit 1; }

scp deploy/out/metamorph-api deploy/out/web.tar.gz "$HOST":/tmp/
# -t so sudo can ask for your password
ssh -t "$HOST" '
  set -e
  sudo install -m 0755 /tmp/metamorph-api /usr/local/bin/metamorph-api
  sudo find /var/www/metamorph -mindepth 1 -delete
  sudo tar -xzf /tmp/web.tar.gz -C /var/www/metamorph
  sudo restorecon -R /usr/local/bin/metamorph-api /var/www/metamorph
  rm -f /tmp/metamorph-api /tmp/web.tar.gz
  sudo systemctl restart metamorph-api
  sleep 2
  systemctl is-active metamorph-api'

if [ -n "${2:-}" ]; then
  echo "==> health check"
  curl -fsS "$2/api/health" && echo
fi
