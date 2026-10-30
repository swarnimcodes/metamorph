//! Stats endpoints. Workouts are logged through the real API at explicit past
//! timestamps, and the expected numbers below are worked out by hand.

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
use time::{Date, Duration, OffsetDateTime};
use tower::ServiceExt;
use uuid::Uuid;

fn app(pool: PgPool) -> Router {
    router(AppState {
        pool,
        config: Arc::new(Config {
            jwt_secret: "test-secret".into(),
            access_token_ttl_secs: 3600,
            dev_login: true,
            bind_addr: "127.0.0.1:0".parse().unwrap(),
            google_client_ids: vec![],
            cors_origins: vec![],
        }),
        google: None,
    })
}

async fn call(app: &Router, method: Method, uri: &str, token: Option<&str>, body: Option<Value>) -> (StatusCode, Value) {
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
    (status, if bytes.is_empty() { Value::Null } else { serde_json::from_slice(&bytes).unwrap_or(Value::Null) })
}

async fn get(app: &Router, uri: &str, token: &str) -> Value {
    let (status, body) = call(app, Method::GET, uri, Some(token), None).await;
    assert_eq!(status, StatusCode::OK, "{uri}: {body}");
    body
}

async fn post(app: &Router, uri: &str, token: &str, body: Value) -> Value {
    let (status, body) = call(app, Method::POST, uri, Some(token), Some(body)).await;
    assert!(status.is_success(), "{uri}: {status} {body}");
    body
}

async fn login(app: &Router, username: &str) -> (String, Uuid) {
    let (status, body) =
        call(app, Method::POST, "/auth/dev-login", None, Some(json!({ "username": username }))).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    (body["access_token"].as_str().unwrap().into(), body["user_id"].as_str().unwrap().parse().unwrap())
}

async fn exercise_id(app: &Router, token: &str, slug: &str) -> Uuid {
    let body = get(app, &format!("/exercises?q={slug}"), token).await;
    body.as_array().unwrap().iter().find(|e| e["slug"] == slug).unwrap()["id"].as_str().unwrap().parse().unwrap()
}

async fn tag_id(app: &Router, token: &str, slug: &str) -> Uuid {
    let body = get(app, "/tags", token).await;
    body.as_array().unwrap().iter().find(|t| t["slug"] == slug).unwrap()["id"].as_str().unwrap().parse().unwrap()
}

fn days_ago(n: i64) -> Date {
    OffsetDateTime::now_utc().date() - Duration::days(n)
}

fn at(date: Date, hh: u8, mm: u8) -> String {
    format!("{date}T{hh:02}:{mm:02}:00Z")
}

fn parse_date(s: &str) -> Date {
    let mut p = s.split('-').map(|x| x.parse::<i32>().unwrap());
    let (y, m, d) = (p.next().unwrap(), p.next().unwrap(), p.next().unwrap());
    Date::from_calendar_date(y, time::Month::try_from(m as u8).unwrap(), d as u8).unwrap()
}

/// One exercise entry of a workout: the exercise, its tags, and its sets.
struct Entry {
    exercise: Uuid,
    tags: Vec<Uuid>,
    sets: Vec<Value>,
}

fn entry(exercise: Uuid, sets: Vec<Value>) -> Entry {
    Entry { exercise, tags: vec![], sets }
}

fn kg(weight: f64, reps: i32) -> Value {
    json!({ "weight_kg": weight, "reps": reps })
}

fn warmup(weight: f64, reps: i32) -> Value {
    json!({ "weight_kg": weight, "reps": reps, "set_type": "warmup" })
}

async fn log_workout(app: &Router, token: &str, started_at: &str, entries: Vec<Entry>) -> Uuid {
    let w = post(app, "/workouts", token, json!({ "started_at": started_at })).await;
    let wid = w["id"].as_str().unwrap().to_string();
    for e in entries {
        let we = post(
            app,
            &format!("/workouts/{wid}/exercises"),
            token,
            json!({ "exercise_id": e.exercise, "tag_ids": e.tags }),
        )
        .await;
        for set in e.sets {
            post(app, &format!("/workout-exercises/{}/sets", we["id"].as_str().unwrap()), token, set).await;
        }
    }
    wid.parse().unwrap()
}

async fn set_timezone(app: &Router, token: &str, tz: &str) {
    let (status, body) = call(app, Method::PATCH, "/me", Some(token), Some(json!({ "timezone": tz }))).await;
    assert_eq!(status, StatusCode::OK, "{body}");
}

fn day_entry(consistency: &Value, date: Date) -> Option<&Value> {
    consistency["days"].as_array().unwrap().iter().find(|d| d["date"] == date.to_string())
}

// ---- consistency ----

#[sqlx::test(migrations = "../../migrations")]
async fn days_are_bucketed_in_the_users_own_timezone(pool: PgPool) {
    let app = app(pool);
    let (utc, _) = login(&app, "utcuser").await;
    let (ist, _) = login(&app, "kolkata").await;
    set_timezone(&app, &ist, "Asia/Kolkata").await;
    let bench = exercise_id(&app, &utc, "bench-press").await;

    // 21:30 UTC is 03:00 the next day in Kolkata (UTC+5:30); 10:00 UTC is the same local day as that.
    let d = days_ago(5);
    for token in [&utc, &ist] {
        log_workout(&app, token, &at(d, 21, 30), vec![entry(bench, vec![kg(40.0, 8)])]).await;
    }
    log_workout(&app, &ist, &at(d + Duration::days(1), 10, 0), vec![entry(bench, vec![kg(40.0, 8)])]).await;

    let u = get(&app, "/stats/consistency", &utc).await;
    assert_eq!(u["timezone"], "UTC");
    assert_eq!(u["days"].as_array().unwrap().len(), 1);
    assert_eq!(u["days"][0]["date"], d.to_string());
    assert_eq!(u["days"][0]["workouts"], 1);

    let k = get(&app, "/stats/consistency", &ist).await;
    assert_eq!(k["timezone"], "Asia/Kolkata");
    assert_eq!(k["days"].as_array().unwrap().len(), 1, "both workouts land on the same local day: {k}");
    assert_eq!(k["days"][0]["date"], (d + Duration::days(1)).to_string());
    assert_eq!(k["days"][0]["workouts"], 2);
}

#[sqlx::test(migrations = "../../migrations")]
async fn only_workouts_with_logged_sets_count(pool: PgPool) {
    let app = app(pool);
    let (token, _) = login(&app, "counter").await;
    let bench = exercise_id(&app, &token, "bench-press").await;

    // Counts: 2 working sets (40x8, 40x6 = 560 kg); the warm-up is excluded from sets and volume.
    log_workout(&app, &token, &at(days_ago(3), 9, 0), vec![entry(bench, vec![warmup(20.0, 10), kg(40.0, 8), kg(40.0, 6)])]).await;
    // Started but nothing logged.
    post(&app, "/workouts", &token, json!({ "started_at": at(days_ago(4), 9, 0) })).await;
    // Logged, then deleted.
    let gone = log_workout(&app, &token, &at(days_ago(5), 9, 0), vec![entry(bench, vec![kg(40.0, 8)])]).await;
    call(&app, Method::DELETE, &format!("/workouts/{gone}"), Some(&token), None).await;
    // Its only set was removed again.
    let w = post(&app, "/workouts", &token, json!({ "started_at": at(days_ago(6), 9, 0) })).await;
    let we = post(&app, &format!("/workouts/{}/exercises", w["id"].as_str().unwrap()), &token, json!({ "exercise_id": bench })).await;
    let set = post(&app, &format!("/workout-exercises/{}/sets", we["id"].as_str().unwrap()), &token, kg(40.0, 8)).await;
    call(&app, Method::DELETE, &format!("/sets/{}", set["id"].as_str().unwrap()), Some(&token), None).await;

    let c = get(&app, "/stats/consistency", &token).await;
    assert_eq!(c["days"].as_array().unwrap().len(), 1, "{c}");
    let day = day_entry(&c, days_ago(3)).expect("the real workout day");
    assert_eq!((day["workouts"].as_i64(), day["sets"].as_i64(), day["volume_kg"].as_f64()), (Some(1), Some(2), Some(560.0)));
    assert_eq!(c["totals"]["workouts"], 1);
    assert_eq!(c["totals"]["active_days"], 1);
    assert_eq!(c["totals"]["sets"], 2);
    assert_eq!(c["totals"]["volume_kg"], 560.0);
}

#[sqlx::test(migrations = "../../migrations")]
async fn week_streaks_follow_the_rules(pool: PgPool) {
    let app = app(pool);
    let bench_user = login(&app, "streaker").await.0;
    let bench = exercise_id(&app, &bench_user, "bench-press").await;
    let log_weeks = |token: String, weeks: Vec<i64>| {
        let app = app.clone();
        async move {
            for w in weeks {
                log_workout(&app, &token, &at(days_ago(7 * w), 12, 0), vec![entry(bench, vec![kg(40.0, 8)])]).await;
            }
        }
    };
    let streak = |token: String| {
        let app = app.clone();
        async move {
            let c = get(&app, "/stats/consistency", &token).await;
            (c["streak"]["current_weeks"].as_u64().unwrap(), c["streak"]["longest_weeks"].as_u64().unwrap())
        }
    };

    // This week and the two before it, a gap, then a run of four.
    log_weeks(bench_user.clone(), vec![0, 1, 2, 5, 6, 7, 8]).await;
    assert_eq!(streak(bench_user).await, (3, 4));

    // Nothing logged yet this week: last week's run is still alive.
    let t2 = login(&app, "notyet").await.0;
    log_weeks(t2.clone(), vec![1, 2]).await;
    assert_eq!(streak(t2).await, (2, 2));

    // A whole week skipped breaks the current streak but not the record.
    let t3 = login(&app, "lapsed").await.0;
    log_weeks(t3.clone(), vec![2, 3]).await;
    assert_eq!(streak(t3).await, (0, 2));

    // The record covers all history, even beyond the visible window.
    let t4 = login(&app, "veteran").await.0;
    log_weeks(t4.clone(), vec![60, 61, 62]).await;
    let c = get(&app, "/stats/consistency", &t4).await;
    assert!(c["days"].as_array().unwrap().is_empty(), "outside the 53-week window: {c}");
    assert_eq!((c["streak"]["current_weeks"].as_u64(), c["streak"]["longest_weeks"].as_u64()), (Some(0), Some(3)));
}

#[sqlx::test(migrations = "../../migrations")]
async fn consistency_window_is_monday_aligned_and_clamped(pool: PgPool) {
    let app = app(pool);
    let (token, _) = login(&app, "windowed").await;
    let (other, _) = login(&app, "bystander").await;
    let bench = exercise_id(&app, &token, "bench-press").await;
    log_workout(&app, &other, &at(days_ago(2), 9, 0), vec![entry(bench, vec![kg(40.0, 8)])]).await;

    let default = get(&app, "/stats/consistency", &token).await;
    assert!(default["days"].as_array().unwrap().is_empty(), "another user's workouts must never show up");
    assert_eq!(default["totals"]["workouts"], 0);

    for (weeks, expected_weeks) in [("0", 1), ("1", 1), ("500", 104), ("12", 12)] {
        let c = get(&app, &format!("/stats/consistency?weeks={weeks}"), &token).await;
        let (from, to) = (parse_date(c["from"].as_str().unwrap()), parse_date(c["to"].as_str().unwrap()));
        assert_eq!(from.weekday(), time::Weekday::Monday, "weeks={weeks}");
        let span = (to - from).whole_days();
        assert!(((expected_weeks - 1) * 7..=expected_weeks * 7 - 1).contains(&span), "weeks={weeks}: span {span}");
    }
}

// ---- exercises list ----

#[sqlx::test(migrations = "../../migrations")]
async fn logged_exercises_group_by_variant_and_resolve_merges(pool: PgPool) {
    let app = app(pool.clone());
    let (token, _) = login(&app, "lister").await;
    let bench = exercise_id(&app, &token, "bench-press").await;
    let plank = exercise_id(&app, &token, "plank").await;
    let incline = tag_id(&app, &token, "incline").await;
    let dumbbell = tag_id(&app, &token, "dumbbell").await;

    log_workout(&app, &token, &at(days_ago(30), 9, 0), vec![entry(bench, vec![kg(40.0, 8)])]).await;
    log_workout(&app, &token, &at(days_ago(20), 9, 0), vec![entry(bench, vec![kg(42.5, 6)])]).await;
    let merged_workout = log_workout(&app, &token, &at(days_ago(15), 9, 0), vec![entry(bench, vec![kg(45.0, 5)])]).await;
    log_workout(
        &app,
        &token,
        &at(days_ago(2), 9, 0),
        vec![
            Entry { exercise: bench, tags: vec![incline, dumbbell], sets: vec![kg(20.0, 10)] },
            // Warm-up only: it never counts as having done the exercise.
            entry(plank, vec![json!({ "duration_s": 30, "set_type": "warmup" })]),
        ],
    )
    .await;

    // A duplicate exercise merged into Bench Press: history logged against it still counts.
    let old: Uuid = sqlx::query_scalar(
        "insert into exercises (slug, name, kind, status, merged_into_id)
         values ('old-bench', 'Old Bench', 'weight_reps', 'official', $1) returning id",
    )
    .bind(bench)
    .fetch_one(&pool)
    .await
    .unwrap();
    sqlx::query("update workout_exercises set exercise_id = $1 where workout_id = $2")
        .bind(old)
        .bind(merged_workout)
        .execute(&pool)
        .await
        .unwrap();

    let list = get(&app, "/stats/exercises", &token).await;
    let items = list.as_array().unwrap();
    assert_eq!(items.len(), 2, "plank (warm-up only) and the merged name must not appear separately: {list}");

    // Most recently performed first: the tagged variant (2 days ago), then untagged.
    assert_eq!(items[0]["name"], "Bench Press");
    assert_eq!(items[0]["variant_key"], "dumbbell+incline");
    assert_eq!(items[0]["variant_label"], "Dumbbell + Incline");
    assert_eq!(items[0]["sessions"], 1);
    assert_eq!(items[0]["last_performed"], days_ago(2).to_string());
    assert_eq!(items[0]["kind"], "weight_reps");

    assert_eq!(items[1]["variant_key"], "");
    assert_eq!(items[1]["variant_label"], "");
    assert_eq!(items[1]["sessions"], 3, "two direct sessions plus one logged against the merged duplicate");
    assert_eq!(items[1]["exercise_id"], bench.to_string());
}

// ---- progress ----

#[sqlx::test(migrations = "../../migrations")]
async fn progress_numbers_and_records(pool: PgPool) {
    let app = app(pool);
    let (token, _) = login(&app, "progressive").await;
    let bench = exercise_id(&app, &token, "bench-press").await;
    let incline = tag_id(&app, &token, "incline").await;

    let (a, b, c, d) = (days_ago(20), days_ago(10), days_ago(3), days_ago(1));
    log_workout(&app, &token, &at(a, 10, 0), vec![entry(bench, vec![warmup(20.0, 10), kg(40.0, 8), kg(40.0, 6)])]).await;
    log_workout(&app, &token, &at(b, 10, 0), vec![entry(bench, vec![kg(42.5, 5), kg(30.0, 15)])]).await;
    log_workout(&app, &token, &at(c, 10, 0), vec![entry(bench, vec![kg(100.0, 1)])]).await;
    log_workout(&app, &token, &at(d, 10, 0), vec![Entry { exercise: bench, tags: vec![incline], sets: vec![kg(30.0, 10)] }]).await;

    let url = format!("/stats/exercises/{bench}/progress");

    // All variations combined.
    let all = get(&app, &url, &token).await;
    assert_eq!(all["name"], "Bench Press");
    assert_eq!(all["kind"], "weight_reps");
    assert!(all["variant_key"].is_null());
    assert_eq!(all["points"].as_array().unwrap().len(), 4);

    // Untagged only: three sessions, ascending, with hand-computed numbers.
    let plain = get(&app, &format!("{url}?variant_key="), &token).await;
    assert_eq!(plain["variant_key"], "");
    let p = plain["points"].as_array().unwrap();
    assert_eq!(p.len(), 3);
    assert_eq!(p.iter().map(|x| x["date"].as_str().unwrap()).collect::<Vec<_>>(), [a, b, c].map(|x| x.to_string()));

    // A: warm-up ignored. 40x8 + 40x6 = 560 kg, e1RM 40 x (1 + 8/30) = 50.67.
    assert_eq!(p[0]["sets"], 2);
    assert_eq!(p[0]["volume_kg"], 560.0);
    assert_eq!(p[0]["top_weight_kg"], 40.0);
    assert_eq!(p[0]["best_e1rm_kg"], 50.67);
    assert_eq!((p[0]["top_reps"].as_i64(), p[0]["total_reps"].as_i64()), (Some(8), Some(14)));
    // B: 42.5x5 + 30x15 = 662.5 kg. The 15-rep set is too long for a 1RM estimate: 42.5 x (1 + 5/30) = 49.58.
    assert_eq!(p[1]["volume_kg"], 662.5);
    assert_eq!(p[1]["best_e1rm_kg"], 49.58);
    assert_eq!((p[1]["top_weight_kg"].as_f64(), p[1]["top_reps"].as_i64(), p[1]["total_reps"].as_i64()), (Some(42.5), Some(15), Some(20)));
    // C: a single is its own 1RM.
    assert_eq!((p[2]["volume_kg"].as_f64(), p[2]["best_e1rm_kg"].as_f64(), p[2]["top_weight_kg"].as_f64()), (Some(100.0), Some(100.0), Some(100.0)));
    // Not applicable to this kind.
    for field in ["best_duration_s", "total_duration_s", "best_distance_m", "total_distance_m"] {
        assert!(p[0][field].is_null(), "{field}");
    }

    let r = &plain["records"];
    assert_eq!((r["top_weight_kg"]["value"].as_f64(), r["top_weight_kg"]["date"].as_str()), (Some(100.0), Some(c.to_string().as_str())));
    assert_eq!((r["best_e1rm_kg"]["value"].as_f64(), r["best_e1rm_kg"]["date"].as_str()), (Some(100.0), Some(c.to_string().as_str())));
    assert_eq!((r["best_volume_kg"]["value"].as_f64(), r["best_volume_kg"]["date"].as_str()), (Some(662.5), Some(b.to_string().as_str())));
    assert_eq!((r["top_reps"]["value"].as_i64(), r["top_reps"]["date"].as_str()), (Some(15), Some(b.to_string().as_str())));
    assert!(r["best_duration_s"].is_null() && r["best_distance_m"].is_null());

    // The incline variant on its own.
    let tagged = get(&app, &format!("{url}?variant_key=incline"), &token).await;
    assert_eq!(tagged["points"].as_array().unwrap().len(), 1);
    assert_eq!(tagged["points"][0]["volume_kg"], 300.0);
}

#[sqlx::test(migrations = "../../migrations")]
async fn progress_for_duration_and_distance_exercises(pool: PgPool) {
    let app = app(pool);
    let (token, _) = login(&app, "endurance").await;
    let plank = exercise_id(&app, &token, "plank").await;
    let running = exercise_id(&app, &token, "running").await;

    log_workout(&app, &token, &at(days_ago(9), 7, 0), vec![
        entry(plank, vec![json!({ "duration_s": 60 })]),
        entry(running, vec![json!({ "distance_m": 5000, "duration_s": 1500 })]),
    ]).await;
    log_workout(&app, &token, &at(days_ago(2), 7, 0), vec![
        entry(plank, vec![json!({ "duration_s": 90 }), json!({ "duration_s": 45 })]),
        entry(running, vec![json!({ "distance_m": 6000, "duration_s": 1900 })]),
    ]).await;

    let p = get(&app, &format!("/stats/exercises/{plank}/progress"), &token).await;
    assert_eq!(p["kind"], "duration");
    assert_eq!(p["points"][1]["best_duration_s"], 90);
    assert_eq!(p["points"][1]["total_duration_s"], 135);
    assert!(p["points"][1]["volume_kg"].is_null() && p["points"][1]["best_e1rm_kg"].is_null());
    assert_eq!(p["records"]["best_duration_s"]["value"], 90);
    assert_eq!(p["records"]["best_duration_s"]["date"], days_ago(2).to_string());
    assert!(p["records"]["top_weight_kg"].is_null());

    let r = get(&app, &format!("/stats/exercises/{running}/progress"), &token).await;
    assert_eq!(r["kind"], "distance");
    assert_eq!(r["points"][0]["best_distance_m"], 5000.0);
    assert_eq!(r["points"][1]["total_distance_m"], 6000.0);
    assert_eq!(r["records"]["best_distance_m"]["value"], 6000.0);
    assert_eq!(r["points"][0]["best_duration_s"], 1500);
}

#[sqlx::test(migrations = "../../migrations")]
async fn progress_visibility_and_edge_cases(pool: PgPool) {
    let app = app(pool.clone());
    let (token, _) = login(&app, "viewer").await;
    let (other, other_id) = login(&app, "owner2").await;
    let bench = exercise_id(&app, &token, "bench-press").await;
    let squat = exercise_id(&app, &token, "squat").await;
    log_workout(&app, &token, &at(days_ago(4), 9, 0), vec![entry(bench, vec![kg(40.0, 8)])]).await;

    // Never logged: a valid, empty answer rather than an error.
    let empty = get(&app, &format!("/stats/exercises/{squat}/progress"), &token).await;
    assert_eq!(empty["points"], json!([]));
    assert!(empty["records"].as_object().unwrap().values().all(Value::is_null), "{empty}");

    // Unknown ids and other users' private exercises are 404.
    let private: Uuid = sqlx::query_scalar(
        "insert into exercises (name, kind, status, created_by) values ('Secret Curl', 'weight_reps', 'user', $1) returning id",
    )
    .bind(other_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    for id in [Uuid::now_v7(), private] {
        let (status, _) = call(&app, Method::GET, &format!("/stats/exercises/{id}/progress"), Some(&token), None).await;
        assert_eq!(status, StatusCode::NOT_FOUND, "{id}");
    }
    // The owner can see their own.
    let (status, _) = call(&app, Method::GET, &format!("/stats/exercises/{private}/progress"), Some(&other), None).await;
    assert_eq!(status, StatusCode::OK);

    // A merged-away id resolves to its target.
    let old: Uuid = sqlx::query_scalar(
        "insert into exercises (slug, name, kind, status, merged_into_id) values ('old-b', 'Old B', 'weight_reps', 'official', $1) returning id",
    )
    .bind(bench)
    .fetch_one(&pool)
    .await
    .unwrap();
    let via_old = get(&app, &format!("/stats/exercises/{old}/progress"), &token).await;
    assert_eq!(via_old["name"], "Bench Press");
    assert_eq!(via_old["points"].as_array().unwrap().len(), 1);

    // Another user sees none of this user's data.
    let theirs = get(&app, &format!("/stats/exercises/{bench}/progress"), &other).await;
    assert_eq!(theirs["points"], json!([]));
    assert_eq!(get(&app, "/stats/exercises", &other).await, json!([]));
}

#[sqlx::test(migrations = "../../migrations")]
async fn stats_require_authentication(pool: PgPool) {
    let app = app(pool);
    for uri in ["/stats/consistency", "/stats/exercises", &format!("/stats/exercises/{}/progress", Uuid::now_v7())] {
        let (status, _) = call(&app, Method::GET, uri, None, None).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED, "{uri}");
    }
}

#[sqlx::test(migrations = "../../migrations")]
async fn body_weights_are_one_per_day_private_and_validated(pool: PgPool) {
    let app = app(pool);
    let (token, _) = login(&app, "lifter").await;
    let (other, _) = login(&app, "someone_else").await;

    let put = |date: &str, kg: Value| {
        let (app, token, uri) = (app.clone(), token.clone(), format!("/body-weights/{date}"));
        async move { call(&app, Method::PUT, &uri, Some(&token), Some(json!({ "weight_kg": kg }))).await }
    };

    let (status, first) = put("2026-01-05", json!(81.4)).await;
    assert_eq!(status, StatusCode::OK, "{first}");
    assert_eq!(first, json!({ "date": "2026-01-05", "weight_kg": 81.4 }));
    put("2026-01-03", json!(82)).await;
    // Logging the same day again replaces it instead of adding a second entry.
    let (_, again) = put("2026-01-05", json!(81.0)).await;
    assert_eq!(again["weight_kg"], 81.0);

    let list = get(&app, "/body-weights", &token).await;
    assert_eq!(list, json!([{ "date": "2026-01-03", "weight_kg": 82.0 }, { "date": "2026-01-05", "weight_kg": 81.0 }]));
    let ranged = get(&app, "/body-weights?from=2026-01-04", &token).await;
    assert_eq!(ranged.as_array().unwrap().len(), 1);

    assert_eq!(get(&app, "/body-weights", &other).await, json!([]), "entries are private");
    let (status, _) = call(&app, Method::DELETE, "/body-weights/2026-01-05", Some(&other), None).await;
    assert_eq!(status, StatusCode::NOT_FOUND, "another user cannot delete it");

    for bad in [json!(0), json!(-3), json!(500), json!(1000)] {
        let (status, _) = put("2026-01-06", bad).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
    }
    let (status, _) = put("2999-01-01", json!(80)).await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "future day");
    let (status, _) = put("not-a-date", json!(80)).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    let (status, _) = call(&app, Method::GET, "/body-weights", None, None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    let (status, _) = call(&app, Method::DELETE, "/body-weights/2026-01-05", Some(&token), None).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(get(&app, "/body-weights", &token).await.as_array().unwrap().len(), 1);
}

#[sqlx::test(migrations = "../../migrations")]
async fn body_weight_list_keeps_the_newest_entries_when_capped(pool: PgPool) {
    let app = app(pool.clone());
    let (token, user_id) = login(&app, "longtime").await;
    sqlx::query("insert into body_weights (user_id, measured_on, weight_kg) select $1, d::date, 80 from generate_series('2010-01-01'::date, '2010-01-01'::date + 5001, '1 day') d")
        .bind(user_id)
        .execute(&pool)
        .await
        .unwrap();

    let list = get(&app, "/body-weights", &token).await;
    let list = list.as_array().unwrap();
    assert_eq!(list.len(), 5000);
    assert_eq!(list[0]["date"], "2010-01-03", "the two oldest days are the ones dropped");
    assert_eq!(list[4999]["date"], "2023-09-11");
}

// ---- time zones: a workout keeps the day it was done on ----

/// A workout with one set, optionally recording the zone the device was in.
async fn log_in_zone(app: &Router, token: &str, started_at: &str, zone: Option<&str>, exercise: Uuid) -> Uuid {
    let mut body = json!({ "started_at": started_at });
    if let Some(z) = zone {
        body["timezone"] = json!(z);
    }
    let w = post(app, "/workouts", token, body).await;
    let wid = w["id"].as_str().unwrap().to_string();
    let we = post(app, &format!("/workouts/{wid}/exercises"), token, json!({ "exercise_id": exercise })).await;
    post(app, &format!("/workout-exercises/{}/sets", we["id"].as_str().unwrap()), token, kg(60.0, 5)).await;
    wid.parse().unwrap()
}

async fn zone_of(app: &Router, token: &str, id: Uuid) -> String {
    get(app, &format!("/workouts/{id}"), token).await["timezone"].as_str().unwrap().to_string()
}

#[sqlx::test(migrations = "../../migrations")]
async fn each_workout_is_dated_in_the_zone_it_was_done_in_whatever_the_profile_says_now(pool: PgPool) {
    let app = app(pool.clone());
    let (token, _) = login(&app, "traveller").await;
    let bench = exercise_id(&app, &token, "bench-press").await;
    set_timezone(&app, &token, "Asia/Kolkata").await;

    // 2026-01-05 20:00 UTC is midday in Los Angeles but already 01:30 the next morning in India.
    let at_utc = "2026-01-05T20:00:00Z";
    let la = log_in_zone(&app, &token, at_utc, Some("America/Los_Angeles"), bench).await;
    let home = log_in_zone(&app, &token, at_utc, None, bench).await; // no zone sent: the account's (India)
    // A workout from before zones were recorded (null) follows the account's zone.
    let legacy = log_in_zone(&app, &token, "2026-01-03T03:00:00Z", Some("UTC"), bench).await;
    sqlx::query("update workouts set timezone = null where id = $1").bind(legacy).execute(&pool).await.unwrap();

    let dates = |c: &Value| -> Vec<String> {
        c["days"].as_array().unwrap().iter().map(|d| d["date"].as_str().unwrap().to_string()).collect()
    };
    // LA workout: Jan 5. Home workout: Jan 6 (India). Legacy 03:00 UTC: Jan 3 in India (08:30).
    let before = get(&app, "/stats/consistency", &token).await;
    assert_eq!(dates(&before), ["2026-01-03", "2026-01-05", "2026-01-06"], "{before}");

    // The traveller lands in New York and the profile zone follows them. History must not move,
    // except the legacy workout, which has no zone of its own and follows the account.
    set_timezone(&app, &token, "America/New_York").await;
    let after = get(&app, "/stats/consistency", &token).await;
    assert_eq!(
        dates(&after),
        ["2026-01-02", "2026-01-05", "2026-01-06"],
        "recorded workouts keep their day; the legacy one (03:00 UTC = 22:00 the night before in New York) follows the profile: {after}"
    );
    assert_eq!(after["timezone"], "America/New_York", "'today' follows the profile zone");

    // The per-exercise chart dates sessions the same way.
    let progress = get(&app, &format!("/stats/exercises/{bench}/progress"), &token).await;
    let pdates: Vec<&str> = progress["points"].as_array().unwrap().iter().map(|p| p["date"].as_str().unwrap()).collect();
    assert_eq!(pdates, ["2026-01-02", "2026-01-05", "2026-01-06"], "{progress}");

    // Workouts report the zone their times belong in.
    assert_eq!(zone_of(&app, &token, la).await, "America/Los_Angeles");
    assert_eq!(zone_of(&app, &token, home).await, "Asia/Kolkata", "recorded from the account when the device sent none");
    assert_eq!(zone_of(&app, &token, legacy).await, "America/New_York", "a legacy workout reports the account's current zone");
    let list = get(&app, "/workouts", &token).await;
    let zones: std::collections::BTreeSet<&str> =
        list.as_array().unwrap().iter().map(|w| w["timezone"].as_str().unwrap()).collect();
    assert_eq!(zones, ["America/Los_Angeles", "America/New_York", "Asia/Kolkata"].into_iter().collect());
}

#[sqlx::test(migrations = "../../migrations")]
async fn an_unknown_time_zone_is_refused_before_it_can_break_anyone_s_stats(pool: PgPool) {
    let app = app(pool.clone());
    let (token, uid) = login(&app, "typo").await;
    for bad in ["Mars/Olympus", "", "UTC+5", "../etc/passwd"] {
        let (status, body) =
            call(&app, Method::POST, "/workouts", Some(&token), Some(json!({ "timezone": bad }))).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{bad:?}: {body}");
    }
    let n: i64 = sqlx::query_scalar("select count(*) from workouts where user_id = $1").bind(uid).fetch_one(&pool).await.unwrap();
    assert_eq!(n, 0, "a refused request created nothing");

    // The database refuses it too, so a script or a future code path cannot get one in either.
    let w = post(&app, "/workouts", &token, json!({ "timezone": "Europe/London" })).await;
    let res = sqlx::query("update workouts set timezone = 'Nowhere/Land' where id = $1::uuid")
        .bind(w["id"].as_str().unwrap())
        .execute(&pool)
        .await;
    assert!(res.is_err(), "the trigger should reject an unknown zone");
    assert_eq!(w["timezone"], "Europe/London");
}

#[sqlx::test(migrations = "../../migrations")]
async fn a_weigh_in_dated_ahead_of_the_servers_clock_is_fine_for_a_traveller(pool: PgPool) {
    let app = app(pool);
    let (token, _) = login(&app, "eastbound").await;
    // The furthest-ahead local date anywhere is UTC+14. A phone there is on that date; one day later cannot exist yet.
    let ahead = (OffsetDateTime::now_utc() + Duration::hours(14)).date();
    let put = |d: Date| {
        let (app, token) = (app.clone(), token.clone());
        async move { call(&app, Method::PUT, &format!("/body-weights/{d}"), Some(&token), Some(json!({ "weight_kg": 80 }))).await }
    };
    assert_eq!(put(ahead).await.0, StatusCode::OK);
    assert_eq!(put(ahead + Duration::days(1)).await.0, StatusCode::BAD_REQUEST);
}
