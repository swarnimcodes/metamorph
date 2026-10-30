#!/usr/bin/env bash
# Checks scripts/release-notes.sh. Run: scripts/test-release-notes.sh
set -euo pipefail
SCRIPT="$(cd "$(dirname "$0")" && pwd)/release-notes.sh"
CHANGELOG="$(cd "$(dirname "$0")" && pwd)/changelog.sh"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
cp "$CHANGELOG" "$T/changelog.sh"; cp "$SCRIPT" "$T/release-notes.sh"
cd "$T"
git init -q . && git config user.email t@example.com && git config user.name t
git commit -q --allow-empty -m "First"; git tag v0.1.0
git commit -q --allow-empty -m "Add the thing"; git commit -q --allow-empty -m "Bump the version to 0.1.1"
printf 'pretend apk' > app.apk
EXPECT_SUM=$(sha256sum app.apk | cut -d' ' -f1)
CERT=a8653cf182d5447f8a26d73e8f6622a7ca4a56b671073feec1359c467f348af7

fail() { echo "FAIL: $1"; echo "--- got:"; echo "$2"; exit 1; }
has() { grep -qF -- "$2" <<<"$1" || fail "$3" "$1"; }
lacks() { ! grep -qF -- "$2" <<<"$1" || fail "$3" "$1"; }

out=$(CERT_SHA256=$CERT ./release-notes.sh 0.1.1 app.apk v0.1.0 HEAD)
has "$out" "**This is a pre-release.**" "a 0.x version is called a pre-release"
has "$out" "What's new in 0.1.1" "names the version"
has "$out" "- Add the thing" "lists the change"
lacks "$out" "Bump the version" "leaves the version bump out"
lacks "$out" "- First" "does not repeat what an earlier release had"
has "$out" "sha256sum Metamorph-0.1.1-arm64.apk" "names the file to verify"
has "$out" "$EXPECT_SUM" "shows the file's real checksum"
has "$out" "A8:65:3C:F1:82:D5:44:7F:8A:26:D7:3E:8F:66:22:A7:CA:4A:56:B6:71:07:3F:EE:C1:35:9C:46:7F:34:8A:F7" "shows the certificate fingerprint with colons, uppercase"

out=$(CERT_SHA256=$CERT ./release-notes.sh 1.0.0 app.apk v0.1.0 HEAD)
lacks "$out" "pre-release" "a 1.x version is not called a pre-release"

! (./release-notes.sh 0.1.1 app.apk v0.1.0 >/dev/null 2>&1) || fail "refuses to run without the certificate digest" ""
echo "release-notes: all checks passed"
