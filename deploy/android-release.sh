#!/usr/bin/env bash
# Builds the Android APK and signs it with the release key, which lives outside the repo.
#
#   ./deploy/android-release.sh        ->  deploy/out/Metamorph.apk
#
# The key and its password are read from ~/.config/metamorph/release-signing.env (override with
# MM_SIGNING_ENV). See that file's header: it and release.jks must stay private and backed up.
set -euo pipefail
cd "$(dirname "$0")/.."

CONF="${MM_SIGNING_ENV:-$HOME/.config/metamorph/release-signing.env}"
[ -f "$CONF" ] || { echo "No signing config at $CONF" >&2; exit 1; }
set -a; . "$CONF"; set +a
[ -f "$MM_KEYSTORE" ] || { echo "Keystore $MM_KEYSTORE not found" >&2; exit 1; }
: "${ANDROID_HOME:?ANDROID_HOME must point at the Android SDK}"
TOOLS=$(ls -d "$ANDROID_HOME"/build-tools/*/ | sort -V | tail -1)

echo "==> build (arm64)"
(cd app && pnpm tauri android build --apk --target aarch64)

UNSIGNED=app/src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk
OUT=deploy/out
mkdir -p "$OUT"

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
