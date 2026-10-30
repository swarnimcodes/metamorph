# Deploying to the droplet (Fedora 44)

One origin serves everything: Caddy hands out the web app and proxies `/api/*` to the API on
`127.0.0.1:3000`. Postgres is local and reached over its unix socket. Nothing runs as root.

The API is built in a Fedora 44 container (matching the server's glibc) using the committed
`.sqlx` cache, so the droplet never compiles anything and no database is needed to build.

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
| `ci.yml` | every push and pull request | clippy, API tests (Postgres 18), web type-check, build and tests, script tests |
| `ci.yml` → `deploy` | push to `main`, after the tests pass, **only when `AUTO_DEPLOY` is `true`** | builds the API in the Fedora container, uploads it, restarts, checks health, **rolls back** if unhealthy |
| `release.yml` | push to `main` that changes the version in `app/src-tauri/tauri.conf.json`, **only when `AUTO_RELEASE` is `true`** | builds the signed APK and Play bundle, writes a changelog from the commit subjects, publishes a GitHub release |

To make a release: commit "Bump the version to X.Y.Z" (version in `tauri.conf.json`, `package.json`, `src-tauri/Cargo.toml`) and push. Nothing else.
The release workflow can also be started by hand (Actions tab → Release → Run workflow); with "publish" off it builds an
unsigned APK to check the Android toolchain works, and publishes nothing.

### One-time setup

Repository **variables** (Settings → Secrets and variables → Actions → Variables):

| Variable | Value |
|---|---|
| `VITE_GOOGLE_CLIENT_ID` | the web OAuth client id (public; it is in the site's JavaScript anyway) |
| `AUTO_RELEASE` | `true` to publish on version bumps |
| `AUTO_DEPLOY` | `true` to deploy on push to `main` |
| `DEPLOY_HOST` | the server's address |
| `ANDROID_KEY_ALIAS` | optional, defaults to `metamorph` |

**Secrets**, stored on the GitHub *environments* so they are only handed to the job that needs them:

| Environment | Secret | Value |
|---|---|---|
| `release` | `ANDROID_KEYSTORE_B64` | `base64 -w0 ~/.config/metamorph/release.jks` |
| `release` | `ANDROID_KEYSTORE_PASSWORD` | the password in `release-signing.env` |
| `production` | `DEPLOY_SSH_KEY` | the private half of a key made only for CI |
| `production` | `DEPLOY_KNOWN_HOSTS` | the server's host key line (`ssh-keygen -F <host>`), so CI checks it is talking to the right machine |

On the `production` environment, add yourself as a **required reviewer**: every deploy then waits for one approval click.

**Server** (once): `sudo deploy/server/setup-ci-deploy.sh ci-key.pub` creates a `deploy` user that can only be reached with
that key and may run exactly one thing as root, `/usr/local/sbin/metamorph-deploy` (install, restart, health check, roll back).
Its behaviour is tested by `deploy/server/test-metamorph-deploy.sh`, which `ci.yml` runs.

### Things to know

- Whoever can push to `main` (or edit a workflow) can run code on the server and sign releases. Fork pull requests get no secrets.
- A rollback restores the previous binary and site, but not the database: migrations the new version ran stay applied. They
  are written to be additive, so the previous binary keeps working. There are no database backups.
- If the signing key ever leaks, with Play App Signing you can reset the upload key in the Play Console; sideloaded copies
  signed with it cannot be updated by a new key.
