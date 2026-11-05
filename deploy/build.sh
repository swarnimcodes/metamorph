#!/usr/bin/env bash
# Builds everything needed to deploy into deploy/out/: the API (a static Go binary, so it runs on the server without
# any libraries from the build machine) and the web app.
#
# The API lives in its own repository (swarnimcodes/metamorphosis). deploy/api-ref pins the commit that ships, so a
# deploy only changes when that file does. To build a local checkout instead (say, while working on the API):
#   API_SRC=../metamorphosis deploy/build.sh
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p deploy/out
out="$PWD/deploy/out"

API_REPO="${API_REPO:-https://github.com/swarnimcodes/metamorphosis.git}"
if [ -n "${API_SRC:-}" ]; then
  src="$API_SRC"
  echo "==> API from the local checkout $src"
else
  ref="$(tr -d '[:space:]' < deploy/api-ref)"
  [[ "$ref" =~ ^[0-9a-f]{40}$ ]] || { echo "deploy/api-ref must hold a full 40-character commit id, got '$ref'" >&2; exit 1; }
  src="$out/api-src"
  echo "==> API at ${ref:0:12} from $API_REPO"
  rm -rf "$src" && git init -q "$src"
  git -C "$src" fetch -q --depth 1 "$API_REPO" "$ref"
  git -C "$src" checkout -q FETCH_HEAD
fi
(cd "$src" && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags "-s -w" -o "$out/metamorph-api" ./cmd/api)

echo "==> Web app"
# Picks up VITE_GOOGLE_CLIENT_ID from app/.env.local and VITE_API_URL=/api from app/.env.production
(cd app && pnpm install --frozen-lockfile >/dev/null && pnpm build >/dev/null)
tar -C app/dist -czf "$out/web.tar.gz" .

ls -lh "$out"
