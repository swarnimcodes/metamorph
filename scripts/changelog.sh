#!/usr/bin/env bash
# Prints a release changelog: the subject of every commit in FROM..TO, newest first, one bullet each.
#
#   scripts/changelog.sh v0.1.2 HEAD      what changed since v0.1.2
#   scripts/changelog.sh "" HEAD          the whole history (a first release)
#
# Version bumps ("Bump the version to ...") are bookkeeping and are left out. Commit subjects here are written
# to read as changes ("Add ...", "Fix ..."), so they are the changelog.
set -euo pipefail
FROM="${1-}"
TO="${2:-HEAD}"
RANGE="$TO"
[ -n "$FROM" ] && RANGE="$FROM..$TO"

LINES=$(git log --no-merges --pretty='- %s' "$RANGE" | grep -vE '^- Bump the version( to .*)?$' || true)
if [ -z "$LINES" ]; then
  echo "- Maintenance and internal changes."
else
  printf '%s\n' "$LINES"
fi
