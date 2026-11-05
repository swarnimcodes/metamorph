#!/usr/bin/env bash
# Builds everything needed to deploy into deploy/out/: the API (a static Go binary, so it runs on the
# server without any libraries from the build machine) and the web app.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p deploy/out

echo "==> API (Go, static linux/amd64)"
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags "-s -w" -o deploy/out/metamorph-api ./backend/cmd/api

echo "==> Web app"
# Picks up VITE_GOOGLE_CLIENT_ID from app/.env.local and VITE_API_URL=/api from app/.env.production
(cd app && pnpm install --frozen-lockfile >/dev/null && pnpm build >/dev/null)
tar -C app/dist -czf deploy/out/web.tar.gz .

ls -lh deploy/out
