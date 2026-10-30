#!/usr/bin/env bash
# Prints the body of a GitHub release for a built APK.
#
#   CERT_SHA256=<hex digest of the signing certificate> scripts/release-notes.sh <version> <apk> <previous-tag-or-empty> [<to-ref>]
#
# The changelog comes from scripts/changelog.sh. A 0.x version is described as a pre-release.
set -euo pipefail
VERSION="${1:?usage: release-notes.sh <version> <apk> <previous-tag> [to-ref]}"
APK="${2:?usage: release-notes.sh <version> <apk> <previous-tag> [to-ref]}"
FROM="${3-}"
TO="${4:-HEAD}"
CERT="${CERT_SHA256:?set CERT_SHA256 to the SHA-256 digest of the signing certificate}"
HERE="$(cd "$(dirname "$0")" && pwd)"

NAME="Metamorph-${VERSION}-arm64.apk"
SUM=$(sha256sum "$APK" | cut -d' ' -f1)
# 8a65... -> 8A:65:...
CERT_FMT=$(printf '%s' "$CERT" | tr 'a-f' 'A-F' | sed 's/../&:/g; s/:$//')

if [[ "$VERSION" == 0.* ]]; then
  echo 'Early test build of Metamorph, a gym workout tracker. **This is a pre-release.**'
else
  echo 'Metamorph, a gym workout tracker.'
fi
echo
echo "**What's new in $VERSION**"
"$HERE/changelog.sh" "$FROM" "$TO"
cat <<TXT

**Install**

- Android 7.0 or newer, on 64-bit ARM (arm64-v8a) phones only.
- Sign in with Google. It talks to the hosted server at https://metamorph.smarniw.com, so it needs an internet connection and signing in creates an account there.
- Install by opening the APK on your phone and allowing "install unknown apps" for the app you opened it from. It updates an earlier release in place (same signing key).

**Verify the download**

\`\`\`
sha256sum $NAME
$SUM
\`\`\`

Signing certificate SHA-256: \`$CERT_FMT\`
TXT
