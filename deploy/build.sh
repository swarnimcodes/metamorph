#!/usr/bin/env bash
# Builds everything needed to deploy into deploy/out/: the API binary (inside a Fedora 44
# container, using the committed .sqlx cache so no database is needed) and the web app.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p deploy/out

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

echo "==> Web app"
# Picks up VITE_GOOGLE_CLIENT_ID from app/.env.local and VITE_API_URL=/api from app/.env.production
(cd app && pnpm install --frozen-lockfile >/dev/null && pnpm build >/dev/null)
tar -C app/dist -czf deploy/out/web.tar.gz .

ls -lh deploy/out
