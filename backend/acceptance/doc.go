// Package acceptance is a black-box HTTP acceptance suite for the Metamorph API.
//
// It holds no server code. Every test talks to an already running server over HTTP and so
// pins the observable contract (status codes, JSON field names, null versus empty arrays,
// number types, error codes) that any implementation must reproduce. The reference
// behaviour is the Rust server in crates/api; the Go port in backend/ must pass the same tests.
//
// The scenarios are ports of crates/api/tests/api.rs and crates/api/tests/stats.rs
// (crates/api/tests/google.rs is deliberately not covered: it needs in-process fake keys).
//
// # Running it
//
// The easy way starts a server, runs the suite and cleans up, for either implementation:
//
//	backend/acceptance/run.sh rust   # server on 127.0.0.1:3100, database metamorph_accept_rust
//	backend/acceptance/run.sh go     # server on 127.0.0.1:3101, database metamorph_accept_go
//
// run.sh drops and recreates the throwaway database (psql -U postgres -h localhost), builds and
// starts the chosen server with DEV_LOGIN=true RUN_MIGRATIONS=true JWT_SECRET=acceptance, waits
// for GET /health, runs go test, and always stops the server and drops the database afterwards.
//
// To run against a server you started yourself (it must have DEV_LOGIN=true and a migrated
// database):
//
//	API_BASE_URL=http://127.0.0.1:3100 \
//	DATABASE_URL=postgres://postgres@localhost/mydb \
//	go test ./backend/acceptance/... -count=1
//
// # Environment
//
//	API_BASE_URL  base URL of the server under test (default http://127.0.0.1:3100)
//	DATABASE_URL  optional. The same database the server uses. A few scenarios cannot be built
//	              through the public API (merging exercises, back-dating a stored timezone,
//	              expiring a refresh token, soft-deleting a gym, inspecting which tables still
//	              hold a deleted user's rows). Those run SQL through the psql CLI, so psql must
//	              be on PATH. Without DATABASE_URL those tests skip.
//
// # Design rules
//
//   - Each test signs in its own freshly named users (random suffix) via POST /auth/dev-login.
//   - Anything a test creates (gyms, cities, exercises) carries a random token so tests do not
//     see each other's data and can run in parallel against one shared database.
//   - Only the standard library is used.
//   - A test that fails on the Rust server is a wrong test: Rust is the reference.
//
// Not covered black-box: the "dev login is absent unless enabled" and "refresh is mounted even
// with dev login off" checks, because the suite needs DEV_LOGIN=true to sign anyone in.
package acceptance
