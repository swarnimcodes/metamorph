#!/usr/bin/env bash
# Fails if the app is shipping Tauri's stock logo, or the icons are not what Google Play and Android need.
#   scripts/check-icons.sh
set -euo pipefail
cd "$(dirname "$0")/.."
ICONS=app/src-tauri/icons
RES=app/src-tauri/gen/android/app/src/main/res
fail() { echo "icons: $1" >&2; exit 1; }

# Fingerprints of the icons the project was scaffolded with (Tauri's cyan and yellow rings).
STOCK="
b5d93c8ec365c08b11bd006e46a46e227c681d30bb295af3d017573bfc752a83
1f3689f6374b0553996fdc99743799216703835070145d7f0e6ec11e6280139e
dae1ff05b101efea50e4b622fe6a3af8ba8f761162fa7c4fd864adc7cb39eeac
27cf0cdbc78bec8b9a14eaedb084c541a3c191fe5db89766e831fbfd21ce955d"
for f in "$ICONS/icon.png" "$ICONS/128x128.png" "$RES/mipmap-xxxhdpi/ic_launcher.png" "$RES/mipmap-xxxhdpi/ic_launcher_foreground.png"; do
  [ -f "$f" ] || fail "missing $f"
  sum=$(sha256sum "$f" | cut -d' ' -f1)
  grep -q "$sum" <<<"$STOCK" && fail "$f is Tauri's stock icon: regenerate with 'pnpm tauri icon src-tauri/app-icon.png'"
done

# The Play Store icon must be a 512x512 PNG.
file "$ICONS/icon.png" | grep -q 'PNG image data, 512 x 512' || fail "$ICONS/icon.png must be a 512x512 PNG (it is the Play Store icon)"

# The adaptive icon's background is the app's own dark colour, not the template's white.
grep -qi '#121316' "$RES/values/ic_launcher_background.xml" || fail "the adaptive icon background must be #121316"

# The website has a favicon, and it is linked.
[ -f app/public/favicon.png ] || fail "app/public/favicon.png is missing"
grep -q 'rel="icon"' app/index.html || fail "app/index.html does not link a favicon"

echo "icons: ok"
