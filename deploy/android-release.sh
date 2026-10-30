#!/usr/bin/env bash
# Builds the Android app and signs it with the release key, which lives outside the repo.
#
#   ./deploy/android-release.sh        ->  deploy/out/Metamorph.apk   (sideloading, GitHub releases)
#   ./deploy/android-release.sh aab    ->  deploy/out/Metamorph.aab   (upload to Google Play)
#
# The key and its password are read from ~/.config/metamorph/release-signing.env (override with
# MM_SIGNING_ENV). See that file's header: it and release.jks must stay private and backed up.
set -euo pipefail
cd "$(dirname "$0")/.."

KIND="${1:-apk}"
case "$KIND" in apk | aab) ;; *) echo "usage: $0 [apk|aab]" >&2; exit 2 ;; esac

CONF="${MM_SIGNING_ENV:-$HOME/.config/metamorph/release-signing.env}"
[ -f "$CONF" ] || { echo "No signing config at $CONF" >&2; exit 1; }
set -a; . "$CONF"; set +a
[ -f "$MM_KEYSTORE" ] || { echo "Keystore $MM_KEYSTORE not found" >&2; exit 1; }
: "${ANDROID_HOME:?ANDROID_HOME must point at the Android SDK}"
TOOLS=$(ls -d "$ANDROID_HOME"/build-tools/*/ | sort -V | tail -1)

OUT=deploy/out
mkdir -p "$OUT"

if [ "$KIND" = aab ]; then
  echo "==> build bundle (arm64)"
  (cd app && pnpm tauri android build --aab --target aarch64)
  BUNDLE=$(find app/src-tauri/gen/android/app/build/outputs/bundle -name '*.aab' -path '*elease*' | head -1)
  [ -n "$BUNDLE" ] || { echo "No release bundle found" >&2; exit 1; }
  echo "==> sign (an upload key: Google Play re-signs what users install)"
  cp "$BUNDLE" "$OUT/Metamorph.aab"
  # An .aab is a jar-style archive, signed with jarsigner (apksigner is for APKs).
  jarsigner -sigalg SHA256withRSA -digestalg SHA-256 -keystore "$MM_KEYSTORE" \
    -storepass:env MM_KEYSTORE_PASSWORD -keypass:env MM_KEYSTORE_PASSWORD "$OUT/Metamorph.aab" "$MM_KEY_ALIAS" >/dev/null
  jarsigner -verify "$OUT/Metamorph.aab" | head -1
  echo "==> signed with"
  keytool -printcert -jarfile "$OUT/Metamorph.aab" | grep -E "SHA1|SHA256"
  echo "==> file"
  ls -lh "$OUT/Metamorph.aab" | awk '{print $5, $9}'
  sha256sum "$OUT/Metamorph.aab"
  exit 0
fi

echo "==> build (arm64)"
(cd app && pnpm tauri android build --apk --target aarch64)

UNSIGNED=app/src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk
echo "==> align and sign"
"$TOOLS/zipalign" -f -p 4 "$UNSIGNED" "$OUT/aligned.apk"
"$TOOLS/apksigner" sign --ks "$MM_KEYSTORE" --ks-key-alias "$MM_KEY_ALIAS" \
  --ks-pass env:MM_KEYSTORE_PASSWORD --key-pass env:MM_KEYSTORE_PASSWORD \
  --out "$OUT/Metamorph.apk" "$OUT/aligned.apk"
rm -f "$OUT/aligned.apk" "$OUT/Metamorph.apk.idsig"

echo "==> signed with"
"$TOOLS/apksigner" verify --print-certs "$OUT/Metamorph.apk" | grep -E "certificate (SHA-1|SHA-256) digest"
echo "==> file"
ls -lh "$OUT/Metamorph.apk" | awk '{print $5, $9}'
sha256sum "$OUT/Metamorph.apk"
