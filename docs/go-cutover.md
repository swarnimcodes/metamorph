# Switching the API from Rust to Go

The Go API (`backend/`) is a port of the Rust API (`crates/api`). It serves the same HTTP contract from the same
Postgres schema (`migrations/`), so the apps do not change. Production still runs Rust until `API_IMPL` is set to `go`.

## What is verified

| Check | Result |
|---|---|
| Black-box acceptance suite (`backend/acceptance`, 52 tests: auth, `/me`, exercises, gyms, workouts, stats, body weights) | Passes against **both** servers. `backend/acceptance/run.sh rust` and `run.sh go` |
| Google sign-in tests (`backend/internal/api/google_test.go`, ported from `crates/api/tests/google.rs`) | Pass |
| Tokens across implementations (same `JWT_SECRET`, same database) | A token and a refresh token from either server work on the other, so a rollback keeps everyone signed in |
| Migrations | The Go binary uses sqlx's `_sqlx_migrations` table and SHA-384 checksums. On a database Rust migrated, it applies nothing; a changed migration file stops startup |
| Mutation check of the suite | 5 of 6 deliberate bugs in Go were caught. Two gaps found that way got new tests. The sixth (a generic unique-constraint error mapped to 409) is not reachable through the API as far as we found, and is untested |
| Per-module comparison, Go vs Rust, on identical data and requests | About 300 requests: stats and time zones (including DST edges and per-workout zones), body-weight rounding, workouts, exercise search, gyms |
| Raw bytes, both servers on one database (a copy of real-shaped history: 39 workouts, 364 sets), no normalisation | 146 of 146 read responses byte-identical: every list and detail endpoint, stats and exercise progress, in three time zones |
| Routes | The 31 routes of the Rust router and of the Go router are the same set. Every method and path the web/Android client calls exists in Go |
| CORS with the production origin list (`https://tauri.localhost`, `http://localhost:1420`) | 40 cases (preflights for every method, allowed, denied and missing origins, bare `OPTIONS`, 404s): headers and status identical to Rust |
| Google signing keys | Tests against a local key server: one fetch then cached, at most one refetch per 30 s for an unknown key id, rotation accepted after the interval, `max-age` clamped to 60 s to 1 day, failed fetch gives 502 not 401. One fetch of Google's real key set parsed |
| Rust build with the new `migrations/embed.go` in place | Clean rebuild: clippy clean, 55 Rust tests pass |

## Known differences from Rust

None of these affects the shipped apps; none were verified against the apps themselves.

- Wording of the `error` text for malformed JSON bodies differs (the status code is the same).
- Bad query strings and path ids return `{"error": ...}` (400) where Rust returned plain text, except `?limit=` on
  exercises and gyms, which keeps Rust's exact text.
- `"tag_ids": null` and `"force": null` are treated as absent, where Rust answered 400.
- A request body is accepted without a `Content-Type: application/json` header.
- Ties in the tag-only exercise search come out ordered by id (Rust's order was arbitrary).

## Not verified yet

- **A real Google sign-in against the Go server.** Everything around it is tested, but not Google's actual token on
  your phone. This is step 0 of the cutover: run the Go binary locally with your `GOOGLE_CLIENT_IDS` and sign in
  from the web app, then from the Play build.
- Behaviour under concurrent writes (two requests adding sets at once); the Rust code relies on row locks.
- The generic "unique constraint violated" mapping to 409. The suite cannot reach it through the API.
- Memory on the 512 MB server under real use. Idle, the Go process uses about 19 MB (Rust about 25 MB), and the
  systemd unit limits it to 192 MB.

## Cutover

Nothing here has been done. Each step needs your go-ahead.

1. Push the branch. CI runs the new `backend-go` job (format, vet, tests, acceptance suite against Go) and the
   Rust job, which now also runs the acceptance suite against Rust. Both must be green.
2. Pick a quiet moment; avoid a Play review or closed-test window. In GitHub: Settings, Secrets and variables,
   Actions, Variables: add `API_IMPL` = `go`.
3. Re-run the latest CI run on `main`, or push. The deploy job builds a static binary
   (`CGO_ENABLED=0 GOOS=linux GOARCH=amd64`) and ships it with the same `metamorph-deploy` script: same path
   (`/usr/local/bin/metamorph-api`), same service, same health check. It keeps `.prev` and rolls back by itself
   if `/health` fails.
4. Check (sign in with Google from the Play build, not only with curl): `curl https://metamorph.smarniw.com/api/health`, sign in from the app, log and finish a workout, open
   Progress. The server log should show `Google sign-in enabled` and no `applied migration` lines.
5. The server's `/etc/metamorph/env` works unchanged. `RUST_LOG` is ignored now and can be removed.

## Rollback

- Immediately after a bad deploy: the deploy script restores the previous binary by itself if the health check fails.
- Later: delete the `API_IMPL` variable (or set it to `rust`) and redeploy. The schema is the same, so no database
  step is needed, and sessions survive both ways.

## After it has run in production for a while

Delete the Rust API in its own commit: `crates/`, `Cargo.toml`, `Cargo.lock`, `.sqlx/`, `deploy/builder.Dockerfile`,
the `backend` (Rust) job and the `acceptance/run.sh rust` step in `ci.yml`, the `rust` branch of `deploy/build.sh`, and
the Rust parts of the READMEs. Keep `migrations/`: it is the schema, and the Go binary embeds it.
