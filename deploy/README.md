# Deploying to the droplet (Fedora 44)

One origin serves everything: Caddy hands out the web app and proxies `/api/*` to the API on
`127.0.0.1:3000`. Postgres is local and reached over its unix socket. Nothing runs as root.

The API lives in its own repository, [metamorphosis](https://github.com/swarnimcodes/metamorphosis). It is a static
Go binary, built on the build machine (a CI runner or your laptop), so the droplet never compiles anything and the
binary needs no libraries from the machine that built it. `deploy/api-ref` pins the commit of that repository that
ships.

**Shipping an API change:** merge it in metamorphosis (its CI must be green), then put the new commit id in
`deploy/api-ref` here and push. Nothing ships by merging in metamorphosis alone. To try a local checkout:
`API_SRC=../metamorphosis deploy/build.sh`.

## Before you start

- DNS: an `A` record for `metamorph.smarniw.com` pointing at the droplet (`dig +short metamorph.smarniw.com`).
- Google Cloud Console: `https://metamorph.smarniw.com` added to the web client's **Authorized JavaScript origins**.
- The server is hardened (non-root sudo user, key-only SSH, firewall allowing ssh/http/https, swap).

Commands below run **on the server** unless marked *(laptop)*.

## 1. Postgres (once)

```
sudo dnf install -y postgresql-server postgresql-contrib
```
```
psql --version
```
This must say **18 or newer**: the schema uses `uuidv7()`, which only exists from Postgres 18.

```
sudo postgresql-setup --initdb
```
```
sudo systemctl enable --now postgresql
```
Tune for a 512 MB machine:
```
sudo -u postgres psql -c "ALTER SYSTEM SET shared_buffers = '64MB'" -c "ALTER SYSTEM SET max_connections = 30" -c "ALTER SYSTEM SET work_mem = '4MB'" -c "ALTER SYSTEM SET maintenance_work_mem = '32MB'" -c "ALTER SYSTEM SET effective_cache_size = '192MB'"
```
```
sudo systemctl restart postgresql
```

## 2. Service account, database, directories (once)

The API runs as its own no-login user, which is also the database role (peer authentication, no password).
```
sudo useradd --system --create-home --home-dir /var/lib/metamorph --shell /usr/sbin/nologin metamorph
```
```
sudo -u postgres createuser metamorph
```
```
sudo -u postgres createdb --owner metamorph metamorph
```
```
sudo -u metamorph psql -d metamorph -c 'select 1'
```
```
sudo mkdir -p /var/www/metamorph /etc/metamorph
```
```
sudo chown root:metamorph /etc/metamorph && sudo chmod 750 /etc/metamorph
```

## 3. Configuration (once)

*(laptop)* copy the template up:
```
scp deploy/env.example swarnim@139.59.58.223:/tmp/metamorph.env
```
On the server, generate a secret and install the file:
```
openssl rand -hex 32
```
```
sudo install -o root -g metamorph -m 640 /tmp/metamorph.env /etc/metamorph/env && rm /tmp/metamorph.env
```
```
sudoedit /etc/metamorph/env
```
Set `JWT_SECRET` to the value printed above and `GOOGLE_CLIENT_IDS` to your web client id.
Leave `DEV_LOGIN=false`.

## 4. The API service (once)

*(laptop)*
```
scp deploy/metamorph-api.service swarnim@139.59.58.223:/tmp/
```
On the server (it is enabled now and started by the first deploy):
```
sudo install -m 644 /tmp/metamorph-api.service /etc/systemd/system/ && rm /tmp/metamorph-api.service
```
```
sudo systemctl daemon-reload && sudo systemctl enable metamorph-api
```

## 5. Caddy and HTTPS (once)

```
sudo dnf install -y caddy
```
*(laptop)*
```
scp deploy/Caddyfile swarnim@139.59.58.223:/tmp/
```
On the server:
```
sudo install -m 644 /tmp/Caddyfile /etc/caddy/Caddyfile && rm /tmp/Caddyfile
```
```
sudo caddy validate --config /etc/caddy/Caddyfile
```
SELinux must let Caddy connect to the API on localhost:
```
sudo setsebool -P httpd_can_network_connect on
```
```
sudo systemctl enable --now caddy
```
Caddy requests the certificate when it starts, so DNS has to resolve first.

## 6. Deploy (and every later update)

*(laptop)*
```
./deploy/build.sh
```
```
./deploy/push.sh swarnim@139.59.58.223 https://metamorph.smarniw.com
```
The last line should print `{"status":"ok"}` from `https://metamorph.smarniw.com/api/health`.
The API applies its migrations at startup (`RUN_MIGRATIONS=true`).

## Operating it

```
journalctl -u metamorph-api -f        # API logs
journalctl -u caddy -f                # certificate / proxy problems
systemctl status metamorph-api caddy postgresql
sudo -u postgres pg_dump -Fc metamorph > metamorph-$(date +%F).dump    # backup
```

If Caddy answers `502` and its log says *permission denied*, SELinux is blocking the proxy; re-run the
`setsebool` line above.

## Continuous integration, releases and deploys (GitHub Actions)

| Workflow | Runs | Does |
|---|---|---|
| `ci.yml` | every push and pull request | web type-check, build and tests, script tests |
| `ci.yml` → `deploy` | push to `main`, after the tests pass, **only when `AUTO_DEPLOY` is `true`** | builds the API (the commit pinned in `deploy/api-ref`) and the web app, uploads them, restarts, checks health, **rolls back** if unhealthy |
| `release.yml` | push to `main` that changes the version in `app/src-tauri/tauri.conf.json`, **only when `AUTO_RELEASE` is `true`** | builds the signed APK and Play bundle **and the desktop installers** (Linux AppImage, `.deb`, `.rpm`; Windows setup `.exe`), writes a changelog from the commit subjects, publishes one GitHub release with a `SHA256SUMS.txt`, and (when `AUR_PUBLISH` is `true`) updates the AUR package `metamorph-bin` |

To make a release: commit "Bump the version to X.Y.Z" (version in `tauri.conf.json`, `package.json`, `src-tauri/Cargo.toml`) and push. Nothing else.
The release workflow can also be started by hand (Actions tab → Release → Run workflow); with "publish" off it builds an
unsigned APK and the desktop installers to check every toolchain works, and publishes nothing.

### One-time setup

Repository **variables** (Settings → Secrets and variables → Actions → Variables):

| Variable | Value |
|---|---|
| `VITE_GOOGLE_CLIENT_ID` | the web OAuth client id (public; it is in the site's JavaScript anyway) |
| `AUTO_RELEASE` | `true` to publish on version bumps |
| `AUTO_DEPLOY` | `true` to deploy on push to `main` |
| `GOOGLE_DESKTOP_CLIENT_ID` | the OAuth client id of type **Desktop app** (public); the desktop installers sign in with it |
| `AUR_PUBLISH` | `true` to update the AUR package on each release (leave unset until the AUR repository and key exist, see below) |
| `AUR_COMMIT_NAME`, `AUR_COMMIT_EMAIL` | the name and email on the AUR git commits |
| `DEPLOY_HOST` | the server's address |
| `ANDROID_KEY_ALIAS` | optional, defaults to `metamorph` |

**Secrets**, stored on the GitHub *environments* so they are only handed to the job that needs them:

| Environment | Secret | Value |
|---|---|---|
| `release` | `ANDROID_KEYSTORE_B64` | `base64 -w0 ~/.config/metamorph/release.jks` |
| `release` | `ANDROID_KEYSTORE_PASSWORD` | the password in `release-signing.env` |
| `release` | `AUR_SSH_KEY` | the private SSH key registered on your AUR account, for pushing `metamorph-bin` |
| `production` | `DEPLOY_SSH_KEY` | the private half of a key made only for CI |
| `production` | `DEPLOY_KNOWN_HOSTS` | the server's host key line (`ssh-keygen -F <host>`), so CI checks it is talking to the right machine |

Repository **secret** (not in an environment, so the desktop build can also be tried from a branch): `GOOGLE_DESKTOP_CLIENT_SECRET`, the secret of the Desktop client. Google documents it as not confidential for this client type, and it is compiled into the installers; it is kept out of git all the same.

Optionally add yourself as a **required reviewer** on the `production` or `release` environment: every deploy or release then waits for one approval click.

**Server** (once): `sudo deploy/server/setup-ci-deploy.sh ci-key.pub` creates a `deploy` user that can only be reached with
that key and may run exactly one thing as root, `/usr/local/sbin/metamorph-deploy` (install, restart, health check, roll back).
Its behaviour is tested by `deploy/server/test-metamorph-deploy.sh`, which `ci.yml` runs.

### The desktop apps and the AUR package

- The desktop installers are built on GitHub's runners (Linux: Ubuntu, Windows: Windows Server). Both are **unsigned**: Windows
  SmartScreen warns on first run until the app has a code-signing certificate. They carry the production API address and the
  desktop Google client, so the build needs the variable `GOOGLE_DESKTOP_CLIENT_ID` and the repository secret `GOOGLE_DESKTOP_CLIENT_SECRET`.
- The server's `CORS_ORIGINS` must include `tauri://localhost` (the Linux and macOS desktop window's origin) and
  `GOOGLE_CLIENT_IDS` must include the desktop client id, or sign-in fails.
- **AUR (`metamorph-bin`)**: `deploy/aur/PKGBUILD` installs the release's `.deb`. It is a `-bin` package on purpose: the desktop
  Google client secret is compiled into the official build and is not in the public source. One-time setup: register the SSH key
  on your AUR account, push the first version by hand (`git clone ssh://aur@aur.archlinux.org/metamorph-bin.git`, copy the
  PKGBUILD in, `makepkg --printsrcinfo > .SRCINFO`, commit, push), then set `AUR_PUBLISH`, `AUR_COMMIT_NAME`, `AUR_COMMIT_EMAIL` and the
  `AUR_SSH_KEY` secret; later releases update the package themselves.
- Test the packaging without releasing anything: run the workflow by hand with "publish" off, and download the `desktop-*` artifacts.

### Things to know

- Whoever can push to `main` (or edit a workflow) can run code on the server and sign releases. Fork pull requests get no secrets.
- A rollback restores the previous binary and site, but not the database: migrations the new version ran stay applied. They
  are written to be additive, so the previous binary keeps working. There are no database backups.
- If the signing key ever leaks, with Play App Signing you can reset the upload key in the Play Console; sideloaded copies
  signed with it cannot be updated by a new key.
