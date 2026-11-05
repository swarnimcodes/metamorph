#!/usr/bin/env bash
# Builds everything needed to deploy into deploy/out/: the API binary and the web app.
# Rust: inside a Fedora 44 container, using the committed .sqlx cache so no database is needed. Go: a static binary.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p deploy/out

# API_IMPL=rust (default) builds crates/api in a Fedora container; API_IMPL=go builds backend/ as a static binary.
API_IMPL="${API_IMPL:-rust}"
case "$API_IMPL" in
  rust)
    echo "==> API (Fedora 44 container)"
    docker build -q -t metamorph-builder -f deploy/builder.Dockerfile deploy
    docker run --rm \
      -v "$PWD":/src \
      -v metamorph-cargo:/root/.cargo \
      -v metamorph-target:/target \
      -e CARGO_TARGET_DIR=/target -e SQLX_OFFLINE=true \
      metamorph-builder sh -c "
        cargo build --release --locked -p metamorph-api &&
        install -m 0755 /target/release/metamorph-api /src/deploy/out/metamorph-api &&
        chown $(id -u):$(id -g) /src/deploy/out/metamorph-api"
    ;;
  go)
    echo "==> API (Go, static linux/amd64)"
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags "-s -w" -o deploy/out/metamorph-api ./backend/cmd/api
    ;;
  *) echo "API_IMPL must be rust or go, got '$API_IMPL'" >&2; exit 1 ;;
esac

echo "==> Web app"
# Picks up VITE_GOOGLE_CLIENT_ID from app/.env.local and VITE_API_URL=/api from app/.env.production
(cd app && pnpm install --frozen-lockfile >/dev/null && pnpm build >/dev/null)
tar -C app/dist -czf deploy/out/web.tar.gz .

ls -lh deploy/out
