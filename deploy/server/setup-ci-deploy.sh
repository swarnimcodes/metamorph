#!/usr/bin/env bash
# One-time server setup so CI can deploy without a human. Run on the server, as root:
#
#   sudo ./setup-ci-deploy.sh /path/to/ci-key.pub
#
# It creates a `deploy` user that cannot log in with a password, can only be reached with the given key, and may
# run exactly one thing as root: /usr/local/sbin/metamorph-deploy. Safe to run again.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "run as root (sudo)" >&2; exit 1; }
PUB="${1:?usage: setup-ci-deploy.sh /path/to/ci-key.pub}"
HERE="$(cd "$(dirname "$0")" && pwd)"
USER_NAME=deploy

# The key: exactly one line, an ed25519 public key.
[ "$(grep -c . "$PUB")" -eq 1 ] && grep -qE '^ssh-ed25519 [A-Za-z0-9+/=]+( .*)?$' "$PUB" || { echo "$PUB must hold one ssh-ed25519 public key" >&2; exit 1; }

id "$USER_NAME" >/dev/null 2>&1 || useradd --create-home --shell /bin/bash "$USER_NAME"
passwd -l "$USER_NAME" >/dev/null
HOME_DIR=$(getent passwd "$USER_NAME" | cut -d: -f6)

install -d -m 0700 -o "$USER_NAME" -g "$USER_NAME" "$HOME_DIR/.ssh" "$HOME_DIR/incoming"
# `restrict` turns off port, agent and X11 forwarding, a terminal, and ~/.ssh/rc for this key.
printf 'restrict %s\n' "$(cat "$PUB")" > "$HOME_DIR/.ssh/authorized_keys"
chown "$USER_NAME:$USER_NAME" "$HOME_DIR/.ssh/authorized_keys"; chmod 600 "$HOME_DIR/.ssh/authorized_keys"

install -m 0755 -o root -g root "$HERE/metamorph-deploy" /usr/local/sbin/metamorph-deploy

SUDOERS=/etc/sudoers.d/metamorph-deploy
TMP=$(mktemp)
echo "$USER_NAME ALL=(root) NOPASSWD: /usr/local/sbin/metamorph-deploy" > "$TMP"
visudo -cf "$TMP" >/dev/null || { echo "sudoers rule did not validate; nothing changed" >&2; rm -f "$TMP"; exit 1; }
install -m 0440 -o root -g root "$TMP" "$SUDOERS"; rm -f "$TMP"

if command -v restorecon >/dev/null; then restorecon -R "$HOME_DIR/.ssh" /usr/local/sbin/metamorph-deploy "$SUDOERS" || true; fi

echo "ok: user '$USER_NAME' can upload to $HOME_DIR/incoming and run /usr/local/sbin/metamorph-deploy, nothing else."
# sshd may be limited to named users or groups (a hardened server often is).
if command -v sshd >/dev/null; then
  lim=$(sshd -T 2>/dev/null | grep -iE '^(allowusers|allowgroups) ' || true)
  [ -z "$lim" ] || echo "NOTE: sshd restricts who may log in ($lim). Add '$USER_NAME' to it, then reload sshd, or CI cannot connect."
fi
