#!/usr/bin/env bash
# Checks scripts/changelog.sh against a throwaway repository. Run: scripts/test-changelog.sh
set -euo pipefail
SCRIPT="$(cd "$(dirname "$0")" && pwd)/changelog.sh"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
cd "$T"
git init -q . && git config user.email t@example.com && git config user.name t
c() { git commit -q --allow-empty -m "$1"; }
c "First thing"; git tag v1
c "Add a feature"; c "Bump the version to 1.1"; c "Fix a bug"
git tag v2
c "Bump the version to 1.2"

fail() { echo "FAIL: $1"; echo "--- got:"; echo "$2"; exit 1; }

got=$("$SCRIPT" v1 v2)
[ "$got" = $'- Fix a bug\n- Add a feature' ] || fail "lists commits newest first and skips version bumps" "$got"

got=$("$SCRIPT" v2 HEAD)
[ "$got" = "- Maintenance and internal changes." ] || fail "only a bump since the last release gives the fallback line" "$got"

got=$("$SCRIPT" "" v1)
[ "$got" = "- First thing" ] || fail "an empty FROM lists the whole history up to TO" "$got"

c 'Fix "quotes" & $dollars `ticks`'
got=$("$SCRIPT" v2 HEAD)
[ "$got" = $'- Fix "quotes" & $dollars `ticks`' ] || fail "odd characters in a subject pass through untouched" "$got"
echo "changelog: all checks passed"
