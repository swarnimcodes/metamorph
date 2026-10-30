#!/usr/bin/env bash
# CI's version of push.sh: no password prompts. Uploads deploy/out/ to the `deploy` user's inbox and runs the
# one script it may run as root.   usage: deploy/ci-push.sh deploy@host https://domain
set -euo pipefail
HOST="${1:?usage: deploy/ci-push.sh deploy@host https://domain}"
SITE="${2:?usage: deploy/ci-push.sh deploy@host https://domain}"
cd "$(dirname "$0")/.."
test -f deploy/out/metamorph-api && test -f deploy/out/web.tar.gz || { echo "run deploy/build.sh first" >&2; exit 1; }

SSH_OPTS=(-o BatchMode=yes -o StrictHostKeyChecking=yes)
scp "${SSH_OPTS[@]}" deploy/out/metamorph-api deploy/out/web.tar.gz "$HOST":incoming/
ssh "${SSH_OPTS[@]}" "$HOST" 'sudo -n /usr/local/sbin/metamorph-deploy'

echo "==> health check through the public site"
for i in 1 2 3 4 5 6; do
  if curl -fsS --max-time 10 "$SITE/api/health"; then echo; exit 0; fi
  sleep 5
done
echo "the site did not answer its health check" >&2
exit 1
