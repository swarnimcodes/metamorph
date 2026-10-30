#!/usr/bin/env bash
# Tests metamorph-deploy against a temporary tree with stand-ins for systemctl, curl and restorecon.
# Run: deploy/server/test-metamorph-deploy.sh
set -uo pipefail
SCRIPT="$(cd "$(dirname "$0")" && pwd)/metamorph-deploy"
ROOT=$(mktemp -d); trap 'rm -rf "$ROOT"' EXIT
FAILS=0
check() { if [ "$2" = "$3" ]; then echo "  ok   $1"; else echo "  FAIL $1 (expected '$3', got '$2')"; FAILS=$((FAILS + 1)); fi; }

# Stand-ins. "Healthy" means: the installed binary does not contain the word UNHEALTHY.
STUBS="$ROOT/stubs"; mkdir -p "$STUBS"
cat > "$STUBS/systemctl" <<'S'
#!/usr/bin/env bash
echo "$*" >> "$MM_CALLS"
exit 0
S
cat > "$STUBS/curl" <<'S'
#!/usr/bin/env bash
! grep -q UNHEALTHY "$MM_BIN"
S
cat > "$STUBS/restorecon" <<'S'
#!/usr/bin/env bash
echo "restorecon $*" >> "$MM_CALLS"
S
chmod +x "$STUBS"/*

elf() { printf '\177ELF fake binary: %s' "$1"; }   # starts with the ELF magic, like a real executable

fresh() {  # a server tree with the old version installed and an inbox holding $1 as the new binary
  rm -rf "$ROOT/srv"; mkdir -p "$ROOT/srv/web" "$ROOT/srv/inbox" "$ROOT/srv/bin"
  elf OLD > "$ROOT/srv/bin/metamorph-api"; chmod 755 "$ROOT/srv/bin/metamorph-api"
  echo old-site > "$ROOT/srv/web/index.html"
  elf "$1" > "$ROOT/srv/inbox/metamorph-api"
  mkdir -p "$ROOT/new-web"; echo new-site > "$ROOT/new-web/index.html"
  tar -czf "$ROOT/srv/inbox/web.tar.gz" -C "$ROOT/new-web" .
  : > "$ROOT/calls"
}
run() {
  MM_INBOX="$ROOT/srv/inbox" MM_BIN="$ROOT/srv/bin/metamorph-api" MM_WEB="$ROOT/srv/web" MM_LOCK="$ROOT/lock" \
  MM_WAIT_SECS=2 MM_CALLS="$ROOT/calls" PATH="$STUBS:$PATH" "$SCRIPT" > "$ROOT/out" 2>&1
  echo $?
}
bin() { cat "$ROOT/srv/bin/metamorph-api"; }
restarts() { grep -c '^restart' "$ROOT/calls"; }

echo "a healthy new version is installed"
fresh NEW-OK; rc=$(run)
check "exits 0" "$rc" 0
check "the new binary is live" "$(bin)" "$(elf NEW-OK)"
check "the new site is live" "$(cat "$ROOT/srv/web/index.html")" "new-site"
check "the inbox is emptied" "$(ls "$ROOT/srv/inbox" | wc -l | tr -d ' ')" 0
check "restarted once" "$(restarts)" 1
check "the old binary is kept as .prev" "$(cat "$ROOT/srv/bin/metamorph-api.prev")" "$(elf OLD)"

echo "a new version that never becomes healthy is rolled back"
fresh "NEW-UNHEALTHY"; rc=$(run)
check "exits non-zero" "$rc" 1
check "the old binary is back" "$(bin)" "$(elf OLD)"
check "the old site is back" "$(cat "$ROOT/srv/web/index.html")" "old-site"
check "restarted twice (new, then old)" "$(restarts)" 2
check "says so" "$(grep -c 'ROLLED BACK: the previous version is healthy again' "$ROOT/out")" 1

echo "nothing in the inbox"
fresh NEW-OK; rm "$ROOT/srv/inbox/"*; rc=$(run)
check "exits non-zero" "$rc" 1
check "the live binary is untouched" "$(bin)" "$(elf OLD)"
check "no restart" "$(restarts)" 0

echo "a binary that is not an executable is refused"
fresh NEW-OK; echo "#!/bin/sh" > "$ROOT/srv/inbox/metamorph-api"; rc=$(run)
check "exits non-zero" "$rc" 1
check "the live binary is untouched" "$(bin)" "$(elf OLD)"
check "no restart" "$(restarts)" 0

echo "a web archive without index.html is refused"
fresh NEW-OK; mkdir -p "$ROOT/empty-web"; echo x > "$ROOT/empty-web/other.txt"
tar -czf "$ROOT/srv/inbox/web.tar.gz" -C "$ROOT/empty-web" .; rc=$(run)
check "exits non-zero" "$rc" 1
check "the live site is untouched" "$(cat "$ROOT/srv/web/index.html")" "old-site"
check "no restart" "$(restarts)" 0

echo "two deploys at once"
fresh NEW-OK
( flock "$ROOT/lock" sleep 3 ) & sleep 0.5
rc=$(run)
check "the second is refused" "$rc" 1
check "the live binary is untouched" "$(bin)" "$(elf OLD)"
wait

[ "$FAILS" -eq 0 ] && echo "metamorph-deploy: all checks passed" || { echo "$FAILS check(s) failed"; exit 1; }
