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
