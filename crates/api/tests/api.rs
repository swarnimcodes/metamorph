use std::sync::Arc;

use axum::{
    Router,
    body::Body,
    http::{Method, Request, StatusCode, header},
};
use http_body_util::BodyExt;
use metamorph_api::{AppState, config::Config, router};
use serde_json::{Value, json};
use sqlx::PgPool;
use tower::ServiceExt;
use uuid::Uuid;

fn app(pool: PgPool, dev_login: bool) -> Router {
    router(AppState {
        pool,
        config: Arc::new(Config {
            jwt_secret: "test-secret".into(),
            access_token_ttl_secs: 3600,
            dev_login,
            bind_addr: "127.0.0.1:0".parse().unwrap(),
        }),
    })
}

async fn call(
    app: &Router,
    method: Method,
    uri: &str,
    token: Option<&str>,
    body: Option<Value>,
) -> (StatusCode, Value) {
    let mut req = Request::builder().method(method).uri(uri);
    if let Some(t) = token {
        req = req.header(header::AUTHORIZATION, format!("Bearer {t}"));
    }
    let body = match body {
        Some(v) => {
            req = req.header(header::CONTENT_TYPE, "application/json");
            Body::from(v.to_string())
        }
        None => Body::empty(),
    };
    let resp = app.clone().oneshot(req.body(body).unwrap()).await.unwrap();
    let status = resp.status();
    let bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let json = if bytes.is_empty() { Value::Null } else { serde_json::from_slice(&bytes).unwrap() };
    (status, json)
}

async fn get(app: &Router, uri: &str, token: &str) -> (StatusCode, Value) {
    call(app, Method::GET, uri, Some(token), None).await
}

async fn post(app: &Router, uri: &str, token: &str, body: Value) -> (StatusCode, Value) {
    call(app, Method::POST, uri, Some(token), Some(body)).await
}

/// Returns (token, user_id).
async fn login(app: &Router, username: &str) -> (String, Uuid) {
    let (status, body) =
        call(app, Method::POST, "/auth/dev-login", None, Some(json!({ "username": username }))).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    (
        body["access_token"].as_str().unwrap().to_string(),
        body["user_id"].as_str().unwrap().parse().unwrap(),
    )
}

async fn exercise_id(app: &Router, token: &str, slug: &str) -> Uuid {
    let (_, body) = get(app, &format!("/exercises?q={slug}"), token).await;
    body.as_array()
        .unwrap()
        .iter()
        .find(|e| e["slug"] == slug)
        .unwrap_or_else(|| panic!("exercise {slug} not found in {body}"))["id"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap()
}

async fn tag_id(app: &Router, token: &str, slug: &str) -> Uuid {
    let (_, body) = get(app, "/tags", token).await;
    body.as_array().unwrap().iter().find(|t| t["slug"] == slug).unwrap()["id"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap()
}

#[sqlx::test(migrations = "../../migrations")]
async fn health_reports_ok(pool: PgPool) {
    let (status, body) = call(&app(pool, false), Method::GET, "/health", None, None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["status"], "ok");
}

#[sqlx::test(migrations = "../../migrations")]
async fn dev_login_is_absent_unless_enabled(pool: PgPool) {
    let (status, _) = call(
        &app(pool, false),
        Method::POST,
        "/auth/dev-login",
        None,
        Some(json!({ "username": "bob" })),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[sqlx::test(migrations = "../../migrations")]
async fn dev_login_lowercases_and_rejects_bad_usernames(pool: PgPool) {
    let app = app(pool, true);
    let (token, _) = login(&app, "Bob_1").await;
    let (status, me) = get(&app, "/me", &token).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(me["username"], "bob_1");

    let (status, _) =
        call(&app, Method::POST, "/auth/dev-login", None, Some(json!({ "username": "a!" }))).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    // Logging in again returns the same user rather than failing on the unique key.
    let (again, _) = login(&app, "bob_1").await;
    let (_, me2) = get(&app, "/me", &again).await;
    assert_eq!(me["id"], me2["id"]);
}

#[sqlx::test(migrations = "../../migrations")]
async fn protected_routes_require_a_valid_token(pool: PgPool) {
    let app = app(pool, true);
    for uri in ["/me", "/exercises", "/tags", "/workouts"] {
        let (status, _) = call(&app, Method::GET, uri, None, None).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED, "{uri} without token");
        let (status, _) = get(&app, uri, "not-a-jwt").await;
        assert_eq!(status, StatusCode::UNAUTHORIZED, "{uri} with bad token");
    }
}

#[sqlx::test(migrations = "../../migrations")]
async fn exercise_search_resolves_aliases_and_punctuation(pool: PgPool) {
    let app = app(pool, true);
    let (token, _) = login(&app, "searcher").await;

    for (q, slug) in [
        ("lat%20pulldowns", "lat-pulldown"),
        ("pulldown", "lat-pulldown"),
        ("Lat-Pull-Down", "lat-pulldown"),
        ("RDL", "romanian-deadlift"),
        ("pull-up", "pull-up"),
        ("triceps%20extension", "tricep-extension"),
    ] {
        let (status, body) = get(&app, &format!("/exercises?q={q}"), &token).await;
        assert_eq!(status, StatusCode::OK);
        let slugs: Vec<_> = body.as_array().unwrap().iter().map(|e| e["slug"].clone()).collect();
        assert!(slugs.contains(&json!(slug)), "q={q} expected {slug}, got {slugs:?}");
    }

    let (_, all) = get(&app, "/exercises?limit=5", &token).await;
    assert_eq!(all.as_array().unwrap().len(), 5);
}

#[sqlx::test(migrations = "../../migrations")]
async fn exercise_visibility_hides_other_users_and_merged_rows(pool: PgPool) {
    let app = app(pool.clone(), true);
    let (a, a_id) = login(&app, "alice").await;
    let (b, _) = login(&app, "bobby").await;
    let bench = exercise_id(&app, &a, "bench-press").await;

    let private: Uuid = sqlx::query_scalar(
        "insert into exercises (name, kind, status, created_by)
         values ('Zottman Curl', 'weight_reps', 'user', $1) returning id",
    )
    .bind(a_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    sqlx::query(
        "insert into exercises (slug, name, kind, status, merged_into_id)
         values ('old-dup', 'Old Dup Press', 'weight_reps', 'official', $1)",
    )
    .bind(bench)
    .execute(&pool)
    .await
    .unwrap();

    let (_, mine) = get(&app, "/exercises?q=zottman", &a).await;
    assert_eq!(mine.as_array().unwrap().len(), 1);
    let (_, theirs) = get(&app, "/exercises?q=zottman", &b).await;
    assert!(theirs.as_array().unwrap().is_empty(), "other user's private exercise leaked");
    let (_, merged) = get(&app, "/exercises?q=old%20dup", &a).await;
    assert!(merged.as_array().unwrap().is_empty(), "merged exercise should be hidden");

    // Bob cannot log someone else's private exercise either.
    let (_, w) = post(&app, "/workouts", &b, json!({})).await;
    let (status, _) = post(
        &app,
        &format!("/workouts/{}/exercises", w["id"].as_str().unwrap()),
        &b,
        json!({ "exercise_id": private }),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[sqlx::test(migrations = "../../migrations")]
async fn workout_logging_flow(pool: PgPool) {
    let app = app(pool, true);
    let (token, _) = login(&app, "lifter").await;
    let bench = exercise_id(&app, &token, "bench-press").await;
    let incline = tag_id(&app, &token, "incline").await;
    let dumbbell = tag_id(&app, &token, "dumbbell").await;

    let (status, w) = post(&app, "/workouts", &token, json!({ "title": "Push" })).await;
    assert_eq!(status, StatusCode::CREATED);
    let wid = w["id"].as_str().unwrap().to_string();
    assert!(w["ended_at"].is_null());

    // Tag order in the request must not change the variant key.
    let (status, we) = post(
        &app,
        &format!("/workouts/{wid}/exercises"),
        &token,
        json!({ "exercise_id": bench, "tag_ids": [incline, dumbbell] }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{we}");
    assert_eq!(we["variant_key"], "dumbbell+incline");
    assert_eq!(we["position"], 1);
    assert_eq!(we["tags"].as_array().unwrap().len(), 2);
    let we_id = we["id"].as_str().unwrap().to_string();

    let (_, we2) = post(
        &app,
        &format!("/workouts/{wid}/exercises"),
        &token,
        json!({ "exercise_id": bench }),
    )
    .await;
    assert_eq!(we2["position"], 2);
    assert_eq!(we2["variant_key"], "");

    let (status, set) = post(
        &app,
        &format!("/workout-exercises/{we_id}/sets"),
        &token,
        json!({ "weight_kg": 40.5, "reps": 8, "rpe": 8.5 }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{set}");
    assert_eq!(set["weight_kg"], 40.5);
    assert_eq!(set["set_type"], "working");
    assert_eq!(set["position"], 1);
    let set_id = set["id"].as_str().unwrap().to_string();

    let (_, set2) =
        post(&app, &format!("/workout-exercises/{we_id}/sets"), &token, json!({ "reps": 6 })).await;
    assert_eq!(set2["position"], 2);

    // Edit a set; omitted fields stay as they were.
    let (status, edited) =
        call(&app, Method::PATCH, &format!("/sets/{set_id}"), Some(&token), Some(json!({ "reps": 9 })))
            .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(edited["reps"], 9);
    assert_eq!(edited["weight_kg"], 40.5);

    // The database rejects out-of-range values, surfaced as 400.
    let (status, _) =
        post(&app, &format!("/workout-exercises/{we_id}/sets"), &token, json!({ "rpe": 11 })).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    let (_, detail) = get(&app, &format!("/workouts/{wid}"), &token).await;
    assert_eq!(detail["exercises"].as_array().unwrap().len(), 2);
    assert_eq!(detail["exercises"][0]["sets"].as_array().unwrap().len(), 2);

    let (_, list) = get(&app, "/workouts", &token).await;
    assert_eq!(list[0]["exercise_count"], 2);
    assert_eq!(list[0]["set_count"], 2);

    // Removing a set and an exercise soft-deletes them out of the detail view.
    let (status, _) =
        call(&app, Method::DELETE, &format!("/sets/{set_id}"), Some(&token), None).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (status, _) = call(
        &app,
        Method::DELETE,
        &format!("/workout-exercises/{}", we2["id"].as_str().unwrap()),
        Some(&token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (_, detail) = get(&app, &format!("/workouts/{wid}"), &token).await;
    assert_eq!(detail["exercises"].as_array().unwrap().len(), 1);
    assert_eq!(detail["exercises"][0]["sets"].as_array().unwrap().len(), 1);

    let (status, done) = post(&app, &format!("/workouts/{wid}/finish"), &token, json!({})).await;
    assert_eq!(status, StatusCode::OK);
    let ended = done["ended_at"].clone();
    assert!(ended.is_string());
    let (_, again) = post(&app, &format!("/workouts/{wid}/finish"), &token, json!({})).await;
    assert_eq!(again["ended_at"], ended, "finishing twice must keep the first end time");

    let (status, _) =
        call(&app, Method::DELETE, &format!("/workouts/{wid}"), Some(&token), None).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (status, _) = get(&app, &format!("/workouts/{wid}"), &token).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let (_, list) = get(&app, "/workouts", &token).await;
    assert!(list.as_array().unwrap().is_empty());
}

#[sqlx::test(migrations = "../../migrations")]
async fn users_cannot_touch_each_others_workouts(pool: PgPool) {
    let app = app(pool, true);
    let (a, _) = login(&app, "owner").await;
    let (b, _) = login(&app, "intruder").await;
    let bench = exercise_id(&app, &a, "bench-press").await;

    let (_, w) = post(&app, "/workouts", &a, json!({ "title": "mine" })).await;
    let wid = w["id"].as_str().unwrap().to_string();
    let (_, we) = post(&app, &format!("/workouts/{wid}/exercises"), &a, json!({ "exercise_id": bench })).await;
    let we_id = we["id"].as_str().unwrap().to_string();
    let (_, set) = post(&app, &format!("/workout-exercises/{we_id}/sets"), &a, json!({ "reps": 5 })).await;
    let set_id = set["id"].as_str().unwrap().to_string();

    let attempts = [
        (Method::GET, format!("/workouts/{wid}"), None),
        (Method::PATCH, format!("/workouts/{wid}"), Some(json!({ "title": "pwned" }))),
        (Method::POST, format!("/workouts/{wid}/finish"), Some(json!({}))),
        (Method::POST, format!("/workouts/{wid}/exercises"), Some(json!({ "exercise_id": bench }))),
        (Method::POST, format!("/workout-exercises/{we_id}/sets"), Some(json!({ "reps": 99 }))),
        (Method::PATCH, format!("/sets/{set_id}"), Some(json!({ "reps": 99 }))),
        (Method::DELETE, format!("/sets/{set_id}"), None),
        (Method::DELETE, format!("/workout-exercises/{we_id}"), None),
        (Method::DELETE, format!("/workouts/{wid}"), None),
    ];
    for (method, uri, body) in attempts {
        let (status, _) = call(&app, method.clone(), &uri, Some(&b), body).await;
        assert_eq!(status, StatusCode::NOT_FOUND, "{method} {uri} should be 404 for another user");
    }

    let (_, list) = get(&app, "/workouts", &b).await;
    assert!(list.as_array().unwrap().is_empty());

    // The owner's data is untouched.
    let (_, detail) = get(&app, &format!("/workouts/{wid}"), &a).await;
    assert_eq!(detail["title"], "mine");
    assert_eq!(detail["exercises"].as_array().unwrap().len(), 1);
    assert_eq!(detail["exercises"][0]["sets"][0]["reps"], 5);
    assert!(detail["ended_at"].is_null());
}

async fn login_full(app: &Router, username: &str) -> Value {
    let (status, body) =
        call(app, Method::POST, "/auth/dev-login", None, Some(json!({ "username": username }))).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    body
}

async fn refresh(app: &Router, token: &str) -> (StatusCode, Value) {
    call(app, Method::POST, "/auth/refresh", None, Some(json!({ "refresh_token": token }))).await
}

#[sqlx::test(migrations = "../../migrations")]
async fn refresh_rotates_and_issues_a_working_access_token(pool: PgPool) {
    let dev = app(pool.clone(), true);
    let login = login_full(&dev, "rita").await;
    assert_eq!(login["refresh_expires_in"], 30 * 24 * 60 * 60);
    let first = login["refresh_token"].as_str().unwrap().to_string();
    assert!(first.len() >= 43);

    // Mounted even with dev login off.
    let app = app(pool.clone(), false);
    let (status, second) = refresh(&app, &first).await;
    assert_eq!(status, StatusCode::OK, "{second}");
    assert_ne!(second["refresh_token"].as_str().unwrap(), first);
    assert_eq!(second["user_id"], login["user_id"]);
    assert_eq!(second["username"], "rita");
    let (status, me) = get(&app, "/me", second["access_token"].as_str().unwrap()).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(me["username"], "rita");

    // Both tokens share one family; the first is revoked, the second live.
    let rows = sqlx::query!(
        "select count(*) as \"n!\", count(distinct family_id) as \"families!\",
                count(*) filter (where revoked_at is null) as \"live!\"
           from refresh_tokens"
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!((rows.n, rows.families, rows.live), (2, 1, 1));
}

#[sqlx::test(migrations = "../../migrations")]
async fn reusing_a_rotated_refresh_token_kills_the_whole_family(pool: PgPool) {
    let app = app(pool.clone(), true);
    let first = login_full(&app, "rita").await["refresh_token"].as_str().unwrap().to_string();
    let (_, second) = refresh(&app, &first).await;
    let second = second["refresh_token"].as_str().unwrap().to_string();

    let (status, _) = refresh(&app, &first).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    // The token legitimately issued from that family is dead too.
    let (status, _) = refresh(&app, &second).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    // Another login (new family) is unaffected.
    let other = login_full(&app, "rita").await["refresh_token"].as_str().unwrap().to_string();
    let (status, _) = refresh(&app, &other).await;
    assert_eq!(status, StatusCode::OK);
}

#[sqlx::test(migrations = "../../migrations")]
async fn unknown_and_expired_refresh_tokens_are_rejected(pool: PgPool) {
    let app = app(pool.clone(), true);
    let (status, _) = refresh(&app, "not-a-real-token").await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    let token = login_full(&app, "rita").await["refresh_token"].as_str().unwrap().to_string();
    sqlx::query!("update refresh_tokens set expires_at = now() - interval '1 second'")
        .execute(&pool)
        .await
        .unwrap();
    let (status, _) = refresh(&app, &token).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

/// Logs a workout with two sets of `reps` and `reps + 1`; returns the workout id.
async fn log_bench(
    app: &Router,
    token: &str,
    bench: Uuid,
    started_at: &str,
    tag: Option<Uuid>,
    reps: i64,
) -> String {
    let (_, w) = post(app, "/workouts", token, json!({ "started_at": started_at })).await;
    let wid = w["id"].as_str().unwrap().to_string();
    let mut body = json!({ "exercise_id": bench });
    if let Some(tag) = tag {
        body["tag_ids"] = json!([tag]);
    }
    let (status, we) = post(app, &format!("/workouts/{wid}/exercises"), token, body).await;
    assert_eq!(status, StatusCode::CREATED, "{we}");
    let we_id = we["id"].as_str().unwrap().to_string();
    for r in [reps, reps + 1] {
        let (status, _) = post(
            app,
            &format!("/workout-exercises/{we_id}/sets"),
            token,
            json!({ "reps": r, "weight_kg": 60 }),
        )
        .await;
        assert_eq!(status, StatusCode::CREATED);
    }
    wid
}

#[sqlx::test(migrations = "../../migrations")]
async fn last_performance_matches_variant_and_owner(pool: PgPool) {
    let app = app(pool.clone(), true);
    let (a, _) = login(&app, "lifter").await;
    let (b, _) = login(&app, "other").await;
    let bench = exercise_id(&app, &a, "bench-press").await;
    let cable = tag_id(&app, &a, "cable").await;

    let (status, _) = get(&app, &format!("/exercises/{bench}/last"), &a).await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    let old_plain = log_bench(&app, &a, bench, "2026-01-01T10:00:00Z", None, 5).await;
    let (status, last) = get(&app, &format!("/exercises/{bench}/last"), &a).await;
    assert_eq!(status, StatusCode::OK, "{last}");
    assert_eq!(last["workout_id"], old_plain);
    assert_eq!(last["sets"].as_array().unwrap().len(), 2);
    assert_eq!(last["sets"][0]["reps"], 5);
    assert_eq!(last["sets"][1]["reps"], 6);
    assert_eq!(last["sets"][0]["weight_kg"], 60.0);

    // A newer cable workout does not leak into the untagged lookup, and vice versa.
    let cable_w = log_bench(&app, &a, bench, "2026-02-01T10:00:00Z", Some(cable), 8).await;
    let (_, last) = get(&app, &format!("/exercises/{bench}/last"), &a).await;
    assert_eq!(last["workout_id"], old_plain);
    let (status, last) = get(&app, &format!("/exercises/{bench}/last?variant_key=cable"), &a).await;
    assert_eq!(status, StatusCode::OK, "{last}");
    assert_eq!(last["workout_id"], cable_w);
    assert_eq!(last["sets"][0]["reps"], 8);
    let (status, _) = get(&app, &format!("/exercises/{bench}/last?variant_key=v-bar"), &a).await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    // Another user's newer workout is invisible.
    log_bench(&app, &b, bench, "2026-03-01T10:00:00Z", None, 20).await;
    let (_, last) = get(&app, &format!("/exercises/{bench}/last"), &a).await;
    assert_eq!(last["workout_id"], old_plain);

    // Soft-deleted workouts are skipped, falling back to the older one.
    let newer = log_bench(&app, &a, bench, "2026-04-01T10:00:00Z", None, 10).await;
    let (_, last) = get(&app, &format!("/exercises/{bench}/last"), &a).await;
    assert_eq!(last["workout_id"], newer);
    let (status, _) = call(&app, Method::DELETE, &format!("/workouts/{newer}"), Some(&a), None).await;
    assert!(status.is_success());
    let (_, last) = get(&app, &format!("/exercises/{bench}/last"), &a).await;
    assert_eq!(last["workout_id"], old_plain);

    // The other user sees only their own history.
    let (_, last) = get(&app, &format!("/exercises/{bench}/last"), &b).await;
    assert_eq!(last["sets"][0]["reps"], 20);
}

#[sqlx::test(migrations = "../../migrations")]
async fn last_performance_follows_merged_exercises(pool: PgPool) {
    let app = app(pool.clone(), true);
    let (a, _) = login(&app, "lifter").await;
    let bench = exercise_id(&app, &a, "bench-press").await;
    let squat = exercise_id(&app, &a, "squat").await;
    let wid = log_bench(&app, &a, bench, "2026-01-01T10:00:00Z", None, 5).await;

    sqlx::query!("update exercises set merged_into_id = $1 where id = $2", bench, squat)
        .execute(&pool)
        .await
        .unwrap();
    let (status, last) = get(&app, &format!("/exercises/{squat}/last"), &a).await;
    assert_eq!(status, StatusCode::OK, "{last}");
    assert_eq!(last["workout_id"], wid);
}

async fn create_gym(app: &Router, token: &str, body: Value) -> (StatusCode, Value) {
    post(app, "/gyms", token, body).await
}

#[sqlx::test(migrations = "../../migrations")]
async fn gym_search_normalises_apostrophes_and_prefers_saved_gyms(pool: PgPool) {
    let app = app(pool, true);
    let (a, _) = login(&app, "gymrat").await;
    let (status, golds) = create_gym(&app, &a, json!({ "name": "Golds Gym Aundh", "city": "Pune" })).await;
    assert_eq!(status, StatusCode::CREATED, "{golds}");
    assert_eq!(golds["verified"], false);
    create_gym(&app, &a, json!({ "name": "Anytime Fitness Baner", "city": "Pune" })).await;

    let (status, found) = get(&app, "/gyms?q=gold%27s%20gym%20aundh", &a).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(found[0]["id"], golds["id"], "{found}");
    assert_eq!(found[0]["name"], "Golds Gym Aundh");
    let (_, found) = get(&app, "/gyms?q=aundh", &a).await;
    assert_eq!(found.as_array().unwrap().len(), 1);
    let (_, found) = get(&app, "/gyms?q=zzzzqqq", &a).await;
    assert!(found.as_array().unwrap().is_empty());

    // Empty query: someone else's gym is listed after the caller's saved ones.
    let (b, _) = login(&app, "newbie").await;
    create_gym(&app, &b, json!({ "name": "Aaa Fitness", "city": "Mumbai" })).await;
    let (_, list) = get(&app, "/gyms", &a).await;
    let names: Vec<&str> = list.as_array().unwrap().iter().map(|g| g["name"].as_str().unwrap()).collect();
    assert_eq!(names, ["Anytime Fitness Baner", "Golds Gym Aundh", "Aaa Fitness"]);
    let (_, list) = get(&app, "/gyms?limit=1", &a).await;
    assert_eq!(list.as_array().unwrap().len(), 1);
}

#[sqlx::test(migrations = "../../migrations")]
async fn gym_duplicate_guard_returns_409_and_force_overrides(pool: PgPool) {
    let app = app(pool.clone(), true);
    let (a, _) = login(&app, "gymrat").await;
    let (_, golds) = create_gym(&app, &a, json!({ "name": "Golds Gym Aundh", "city": "Pune" })).await;

    let (status, body) = create_gym(&app, &a, json!({ "name": "Gold's Gym Aundh", "city": "pune" })).await;
    assert_eq!(status, StatusCode::CONFLICT, "{body}");
    assert_eq!(body["error"], "similar gyms exist");
    assert_eq!(body["similar"][0]["id"], golds["id"]);
    assert_eq!(body["similar"][0]["name"], "Golds Gym Aundh");

    // The same name in another city is a different place; unrelated names pass.
    let (status, _) = create_gym(&app, &a, json!({ "name": "Golds Gym Aundh", "city": "Delhi" })).await;
    assert_eq!(status, StatusCode::CREATED);
    let (status, _) = create_gym(&app, &a, json!({ "name": "Cult Fit Kothrud", "city": "Pune" })).await;
    assert_eq!(status, StatusCode::CREATED);

    let before = sqlx::query_scalar!("select count(*) as \"n!\" from gyms").fetch_one(&pool).await.unwrap();
    let (status, _) = create_gym(&app, &a, json!({ "name": "Golds Gym Aundh", "city": "Pune" })).await;
    assert_eq!(status, StatusCode::CONFLICT);
    let after = sqlx::query_scalar!("select count(*) as \"n!\" from gyms").fetch_one(&pool).await.unwrap();
    assert_eq!(before, after, "a rejected create inserts nothing");

    let (status, forced) =
        create_gym(&app, &a, json!({ "name": "Golds Gym Aundh", "city": "Pune", "force": true })).await;
    assert_eq!(status, StatusCode::CREATED, "{forced}");
    assert_ne!(forced["id"], golds["id"]);
}

#[sqlx::test(migrations = "../../migrations")]
async fn default_gym_switching_keeps_exactly_one_default(pool: PgPool) {
    let app = app(pool.clone(), true);
    let (a, a_id) = login(&app, "gymrat").await;
    let (_, g1) = create_gym(&app, &a, json!({ "name": "Alpha Gym", "city": "Pune" })).await;
    let (_, g2) = create_gym(&app, &a, json!({ "name": "Beta Fitness", "city": "Pune" })).await;
    let (g1, g2) = (g1["id"].as_str().unwrap().to_string(), g2["id"].as_str().unwrap().to_string());

    // The first saved gym became the default, the second did not.
    let (_, mine) = get(&app, "/me/gyms", &a).await;
    assert_eq!(mine[0]["id"], g1);
    assert_eq!(mine[0]["is_default"], true);
    assert_eq!(mine[1]["is_default"], false);

    let make_default = |id: String| {
        let app = app.clone();
        let a = a.clone();
        async move { call(&app, Method::PUT, &format!("/me/gyms/{id}/default"), Some(&a), None).await }
    };
    let (status, _) = make_default(g2.clone()).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (_, mine) = get(&app, "/me/gyms", &a).await;
    assert_eq!(mine[0]["id"], g2);
    assert_eq!(mine.as_array().unwrap().iter().filter(|g| g["is_default"] == true).count(), 1);

    // A gym the caller has not saved yet gets added and made default.
    let (b, _) = login(&app, "other").await;
    let (_, g3) = create_gym(&app, &b, json!({ "name": "Gamma Club", "city": "Delhi" })).await;
    let g3 = g3["id"].as_str().unwrap().to_string();
    let (status, _) = make_default(g3.clone()).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (_, mine) = get(&app, "/me/gyms", &a).await;
    assert_eq!(mine.as_array().unwrap().len(), 3);
    assert_eq!(mine[0]["id"], g3);
    let defaults = sqlx::query_scalar!(
        "select count(*) as \"n!\" from user_gyms where user_id = $1 and is_default",
        a_id
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(defaults, 1);

    // Unknown and deleted gyms are 404 and leave the default alone.
    let (status, _) = make_default(Uuid::now_v7().to_string()).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    sqlx::query!("update gyms set deleted_at = now() where id = $1", g1.parse::<Uuid>().unwrap())
        .execute(&pool)
        .await
        .unwrap();
    let (status, _) = make_default(g1.clone()).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let (_, mine) = get(&app, "/me/gyms", &a).await;
    assert_eq!(mine[0]["id"], g3);
    let (_, found) = get(&app, "/gyms?q=alpha", &a).await;
    assert!(found.as_array().unwrap().is_empty());
}

#[sqlx::test(migrations = "../../migrations")]
async fn my_gyms_never_shows_other_users_gyms(pool: PgPool) {
    let app = app(pool, true);
    let (a, _) = login(&app, "gymrat").await;
    let (b, _) = login(&app, "other").await;
    create_gym(&app, &a, json!({ "name": "Alpha Gym", "city": "Pune" })).await;
    let (_, mine) = get(&app, "/me/gyms", &b).await;
    assert!(mine.as_array().unwrap().is_empty());

    // A workout created without a gym leaves it null.
    let (_, w) = post(&app, "/workouts", &a, json!({})).await;
    assert!(w["gym_id"].is_null());
}

#[sqlx::test(migrations = "../../migrations")]
async fn workouts_carry_exercise_kind_and_gym_name(pool: PgPool) {
    let app = app(pool.clone(), true);
    let (token, _) = login(&app, "gymrat").await;
    let plank = exercise_id(&app, &token, "plank").await;

    let (status, gym) = post(&app, "/gyms", &token, json!({ "name": "Golds Gym Aundh", "city": "Pune" })).await;
    assert_eq!(status, StatusCode::CREATED, "{gym}");

    let (_, w) = post(&app, "/workouts", &token, json!({ "gym_id": gym["id"] })).await;
    assert_eq!(w["gym"]["name"], "Golds Gym Aundh");
    assert_eq!(w["gym"]["city"], "Pune");
    let wid = w["id"].as_str().unwrap().to_string();

    let (_, we) =
        post(&app, &format!("/workouts/{wid}/exercises"), &token, json!({ "exercise_id": plank })).await;
    assert_eq!(we["kind"], "duration");

    let (_, detail) = get(&app, &format!("/workouts/{wid}"), &token).await;
    assert_eq!(detail["exercises"][0]["kind"], "duration");
    assert_eq!(detail["gym"]["id"], gym["id"]);

    let (_, list) = get(&app, "/workouts", &token).await;
    assert_eq!(list[0]["gym"]["name"], "Golds Gym Aundh");

    // A workout without a gym reports null rather than omitting the field.
    let (_, bare) = post(&app, "/workouts", &token, json!({})).await;
    assert!(bare["gym"].is_null());
    let (_, list) = get(&app, "/workouts", &token).await;
    assert!(list.as_array().unwrap().iter().any(|w| w["gym"].is_null()));

    // History keeps the gym name even after the gym is soft-deleted.
    sqlx::query("update gyms set deleted_at = now()").execute(&pool).await.unwrap();
    let (_, detail) = get(&app, &format!("/workouts/{wid}"), &token).await;
    assert_eq!(detail["gym"]["name"], "Golds Gym Aundh");
}

#[sqlx::test(migrations = "../../migrations")]
async fn patch_me_updates_preferences_and_validates(pool: PgPool) {
    let app = app(pool, true);
    let (token, _) = login(&app, "prefs").await;

    let (status, me) = call(
        &app,
        Method::PATCH,
        "/me",
        Some(&token),
        Some(json!({ "unit_system": "imperial", "timezone": "Asia/Kolkata", "display_name": "  Prefs P  " })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{me}");
    assert_eq!(me["unit_system"], "imperial");
    assert_eq!(me["timezone"], "Asia/Kolkata");
    assert_eq!(me["display_name"], "Prefs P");

    // Omitted fields stay as they were, and GET /me reflects the change.
    let (_, me) =
        call(&app, Method::PATCH, "/me", Some(&token), Some(json!({ "display_name": "Prefs" }))).await;
    assert_eq!(me["unit_system"], "imperial");
    let (_, me) = get(&app, "/me", &token).await;
    assert_eq!(me["display_name"], "Prefs");
    assert_eq!(me["timezone"], "Asia/Kolkata");

    for bad in [
        json!({ "timezone": "Mars/Olympus" }),
        json!({ "display_name": "   " }),
        json!({ "unit_system": "furlongs" }),
    ] {
        let (status, _) = call(&app, Method::PATCH, "/me", Some(&token), Some(bad.clone())).await;
        assert!(status.is_client_error(), "{bad} should be rejected, got {status}");
    }
    let (_, me) = get(&app, "/me", &token).await;
    assert_eq!(me["unit_system"], "imperial", "rejected requests must not change anything");

    let (status, _) = call(&app, Method::PATCH, "/me", None, Some(json!({}))).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}
