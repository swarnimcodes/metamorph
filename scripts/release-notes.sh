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

**Install on Android**

- Android 7.0 or newer, on 64-bit ARM (arm64-v8a) phones only.
- Sign in with Google. It talks to the hosted server at https://metamorph.smarniw.com, so it needs an internet connection and signing in creates an account there.
- Install by opening the APK on your phone and allowing "install unknown apps" for the app you opened it from. It updates an earlier release in place (same signing key).

**Install on a desktop (Linux and Windows)**

- Linux: \`Metamorph-$VERSION-linux-x86_64.AppImage\` (make it executable, then run it), or the \`.deb\` / \`.rpm\` package. It needs WebKitGTK 4.1 and GTK 3.
- Windows: \`Metamorph-$VERSION-windows-x64-setup.exe\`. It installs for your user only. It is not code-signed yet, so Windows SmartScreen will warn on first run: choose "More info", then "Run anyway".
- Signing in with Google opens your browser for the Google step, then returns to the app.

**Verify the download**

\`\`\`
sha256sum $NAME
$SUM
\`\`\`

Signing certificate SHA-256 (the Android app): \`$CERT_FMT\`

\`SHA256SUMS.txt\` on this release lists the checksum of every file, desktop installers included.
TXT
