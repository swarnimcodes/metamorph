//! Read-only statistics over the caller's logged workouts.
//!
//! Conventions shared by every endpoint:
//! - A "day" is the calendar date in the user's own timezone (`users.timezone`), so a
//!   21:30 UTC workout belongs to the next morning for someone in India.
//! - A workout only counts if it has at least one logged set, so an abandoned empty
//!   workout never inflates a streak.
//! - Warm-up sets are excluded from every number except that rule.
//! - Entries logged against exercises that were merged into another count towards the target.

use std::collections::{BTreeSet, HashMap};

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    routing::get,
};
use rust_decimal::prelude::ToPrimitive;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use time::{Date, Duration};
use uuid::Uuid;

use crate::{
    AppState,
    auth::AuthUser,
    error::{AppError, AppResult},
    models::ExerciseKind,
};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/stats/consistency", get(consistency))
        .route("/stats/exercises", get(logged_exercises))
        .route("/stats/exercises/{id}/progress", get(progress))
}

fn round(value: f64, places: i32) -> f64 {
    let m = 10f64.powi(places);
    (value * m).round() / m
}

async fn timezone_of(pool: &PgPool, user_id: Uuid) -> AppResult<String> {
    sqlx::query_scalar!("select timezone from users where id = $1 and deleted_at is null", user_id)
        .fetch_optional(pool)
        .await?
        .ok_or(AppError::Unauthorized)
}

// ---- consistency ----

#[derive(Deserialize)]
struct ConsistencyParams {
    weeks: Option<i64>,
}

#[derive(Serialize)]
struct Day {
    date: String,
    workouts: i64,
    sets: i64,
    volume_kg: f64,
}

#[derive(Serialize)]
struct Totals {
    workouts: i64,
    active_days: i64,
    sets: i64,
    volume_kg: f64,
}

#[derive(Serialize)]
struct Streak {
    current_weeks: u32,
    longest_weeks: u32,
}

#[derive(Serialize)]
struct Consistency {
    timezone: String,
    from: String,
    to: String,
    days: Vec<Day>,
    totals: Totals,
    streak: Streak,
}

/// Mondays share a week id: the Julian day number is 0 on a Monday modulo 7.
fn week_id(date: Date) -> i64 {
    i64::from(date.to_julian_day()).div_euclid(7)
}

/// `(current, longest)` runs of consecutive weeks that contain a workout. The current
/// run may start from last week, so a week with nothing logged *yet* does not break it.
fn week_streaks(active_weeks: &BTreeSet<i64>, this_week: i64) -> (u32, u32) {
    let mut longest = 0u32;
    let mut run = 0u32;
    let mut previous: Option<i64> = None;
    for &w in active_weeks {
        run = if previous == Some(w - 1) { run + 1 } else { 1 };
        longest = longest.max(run);
        previous = Some(w);
    }

    let start = if active_weeks.contains(&this_week) {
        Some(this_week)
    } else if active_weeks.contains(&(this_week - 1)) {
        Some(this_week - 1)
    } else {
        None
    };
    let current = start.map_or(0, |s| (0..).take_while(|i| active_weeks.contains(&(s - i))).count() as u32);
    (current, longest)
}

async fn consistency(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Query(params): Query<ConsistencyParams>,
) -> AppResult<Json<Consistency>> {
    let pool = &state.pool;
    let tz = timezone_of(pool, user_id).await?;
    let weeks = params.weeks.unwrap_or(53).clamp(1, 104);

    let today = sqlx::query_scalar!(r#"select (now() at time zone $1::text)::date as "today!""#, tz)
        .fetch_one(pool)
        .await?;
    let monday = today - Duration::days(i64::from(today.weekday().number_days_from_monday()));
    let from = monday - Duration::weeks(weeks - 1);

    let rows = sqlx::query!(
        r#"with w as (
               select id, (started_at at time zone $2::text)::date as d
                 from workouts
                where user_id = $1 and deleted_at is null
                  and exists (select 1 from workout_exercises we join sets s on s.workout_exercise_id = we.id
                               where we.workout_id = workouts.id and we.deleted_at is null and s.deleted_at is null)
           )
           select w.d as "date!", count(*) as "workouts!",
                  coalesce(sum(st.sets), 0)::bigint as "sets!",
                  coalesce(sum(st.volume), 0)::float8 as "volume_kg!"
             from w
             left join lateral (
                  select count(*) as sets, sum(coalesce(s.weight_kg, 0) * coalesce(s.reps, 0)) as volume
                    from workout_exercises we
                    join sets s on s.workout_exercise_id = we.id
                   where we.workout_id = w.id and we.deleted_at is null
                     and s.deleted_at is null and s.set_type <> 'warmup'
             ) st on true
            where w.d between $3::date and $4::date
            group by w.d
            order by w.d"#,
        user_id,
        tz,
        from,
        today
    )
    .fetch_all(pool)
    .await?;

    let days: Vec<Day> = rows
        .into_iter()
        .map(|r| Day { date: r.date.to_string(), workouts: r.workouts, sets: r.sets, volume_kg: round(r.volume_kg, 1) })
        .collect();
    let totals = Totals {
        workouts: days.iter().map(|d| d.workouts).sum(),
        active_days: days.len() as i64,
        sets: days.iter().map(|d| d.sets).sum(),
        volume_kg: round(days.iter().map(|d| d.volume_kg).sum(), 1),
    };

    // The longest streak is over all history, not just the window above.
    let active_weeks: BTreeSet<i64> = sqlx::query_scalar!(
        r#"select distinct (w.started_at at time zone $2::text)::date as "d!"
             from workouts w
            where w.user_id = $1 and w.deleted_at is null
              and exists (select 1 from workout_exercises we join sets s on s.workout_exercise_id = we.id
                           where we.workout_id = w.id and we.deleted_at is null and s.deleted_at is null)"#,
        user_id,
        tz
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(week_id)
    .collect();
    let (current_weeks, longest_weeks) = week_streaks(&active_weeks, week_id(today));

    Ok(Json(Consistency {
        timezone: tz,
        from: from.to_string(),
        to: today.to_string(),
        days,
        totals,
        streak: Streak { current_weeks, longest_weeks },
    }))
}

// ---- exercises the user has logged ----

#[derive(Serialize)]
struct LoggedExercise {
    exercise_id: Uuid,
    name: String,
    kind: ExerciseKind,
    variant_key: String,
    variant_label: String,
    sessions: i64,
    last_performed: String,
}

/// "ez-bar+preacher" -> "EZ Bar + Preacher", using the catalog's tag names.
fn variant_label(variant_key: &str, names: &HashMap<String, String>) -> String {
    variant_key
        .split('+')
        .filter(|s| !s.is_empty())
        .map(|slug| names.get(slug).cloned().unwrap_or_else(|| slug.to_string()))
        .collect::<Vec<_>>()
        .join(" + ")
}

async fn tag_names(pool: &PgPool) -> AppResult<HashMap<String, String>> {
    Ok(sqlx::query!("select slug, name from variation_tags")
        .fetch_all(pool)
        .await?
        .into_iter()
        .map(|t| (t.slug, t.name))
        .collect())
}

async fn logged_exercises(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
) -> AppResult<Json<Vec<LoggedExercise>>> {
    let pool = &state.pool;
    let tz = timezone_of(pool, user_id).await?;
    let rows = sqlx::query!(
        r#"select c.id as "exercise_id!", c.name as "name!", c.kind as "kind!: ExerciseKind",
                  we.variant_key as "variant_key!",
                  count(distinct w.id) as "sessions!",
                  (max(w.started_at) at time zone $2::text)::date as "last_performed!"
             from workout_exercises we
             join workouts w on w.id = we.workout_id
             join exercises e on e.id = we.exercise_id
             join exercises c on c.id = coalesce(e.merged_into_id, e.id)
            where w.user_id = $1 and w.deleted_at is null and we.deleted_at is null
              and exists (select 1 from sets s
                           where s.workout_exercise_id = we.id and s.deleted_at is null
                             and s.set_type <> 'warmup')
            group by c.id, c.name, c.kind, we.variant_key
            order by max(w.started_at) desc, c.name, we.variant_key"#,
        user_id,
        tz
    )
    .fetch_all(pool)
    .await?;

    let names = tag_names(pool).await?;
    Ok(Json(
        rows.into_iter()
            .map(|r| LoggedExercise {
                variant_label: variant_label(&r.variant_key, &names),
                exercise_id: r.exercise_id,
                name: r.name,
                kind: r.kind,
                variant_key: r.variant_key,
                sessions: r.sessions,
                last_performed: r.last_performed.to_string(),
            })
            .collect(),
    ))
}

// ---- progress for one exercise ----

#[derive(Deserialize)]
struct ProgressParams {
    /// Absent: all variations combined. Present (even empty): exactly that variant.
    variant_key: Option<String>,
}

#[derive(Serialize, Default)]
struct Point {
    date: String,
    workout_id: Uuid,
    sets: i64,
    volume_kg: Option<f64>,
    top_weight_kg: Option<f64>,
    best_e1rm_kg: Option<f64>,
    top_reps: Option<i32>,
    total_reps: Option<i64>,
    best_duration_s: Option<i32>,
    total_duration_s: Option<i64>,
    best_distance_m: Option<f64>,
    total_distance_m: Option<f64>,
}

#[derive(Serialize)]
struct Record<T> {
    value: T,
    date: String,
}

#[derive(Serialize, Default)]
struct Records {
    top_weight_kg: Option<Record<f64>>,
    best_e1rm_kg: Option<Record<f64>>,
    best_volume_kg: Option<Record<f64>>,
    top_reps: Option<Record<i32>>,
    best_duration_s: Option<Record<i32>>,
    best_distance_m: Option<Record<f64>>,
}

#[derive(Serialize)]
struct Progress {
    exercise_id: Uuid,
    name: String,
    kind: ExerciseKind,
    variant_key: Option<String>,
    points: Vec<Point>,
    records: Records,
}

/// Epley estimate of a one-rep max, trusted only for 1-12 rep sets.
fn estimated_1rm(weight: f64, reps: i32) -> Option<f64> {
    match reps {
        _ if weight <= 0.0 || !(1..=12).contains(&reps) => None,
        1 => Some(weight),
        r => Some(weight * (1.0 + f64::from(r) / 30.0)),
    }
}

struct SetRow {
    weight: Option<f64>,
    reps: Option<i32>,
    duration_s: Option<i32>,
    distance_m: Option<f64>,
}

fn point_from_sets(date: String, workout_id: Uuid, sets: &[SetRow]) -> Point {
    let max_f = |it: Vec<f64>| it.into_iter().fold(None, |a: Option<f64>, v| Some(a.map_or(v, |a| a.max(v))));
    let weights: Vec<f64> = sets.iter().filter_map(|s| s.weight).collect();
    let volumes: Vec<f64> = sets.iter().filter_map(|s| Some(s.weight? * f64::from(s.reps?))).collect();
    let e1rms: Vec<f64> = sets.iter().filter_map(|s| estimated_1rm(s.weight?, s.reps?)).collect();
    let reps: Vec<i32> = sets.iter().filter_map(|s| s.reps).collect();
    let durations: Vec<i32> = sets.iter().filter_map(|s| s.duration_s).collect();
    let distances: Vec<f64> = sets.iter().filter_map(|s| s.distance_m).collect();

    Point {
        date,
        workout_id,
        sets: sets.len() as i64,
        volume_kg: (!volumes.is_empty()).then(|| round(volumes.iter().sum(), 2)),
        top_weight_kg: max_f(weights).map(|v| round(v, 3)),
        best_e1rm_kg: max_f(e1rms).map(|v| round(v, 2)),
        top_reps: reps.iter().copied().max(),
        total_reps: (!reps.is_empty()).then(|| reps.iter().map(|&r| i64::from(r)).sum()),
        best_duration_s: durations.iter().copied().max(),
        total_duration_s: (!durations.is_empty()).then(|| durations.iter().map(|&d| i64::from(d)).sum()),
        best_distance_m: max_f(distances.clone()).map(|v| round(v, 2)),
        total_distance_m: (!distances.is_empty()).then(|| round(distances.iter().sum(), 2)),
    }
}

/// The highest value across points; the earliest session wins a tie.
fn record_of<T: PartialOrd + Copy>(points: &[Point], pick: impl Fn(&Point) -> Option<T>) -> Option<Record<T>> {
    let mut best: Option<(T, &Point)> = None;
    for p in points {
        if let Some(v) = pick(p)
            && best.is_none_or(|(b, _)| v > b)
        {
            best = Some((v, p));
        }
    }
    best.map(|(value, p)| Record { value, date: p.date.clone() })
}

async fn progress(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(exercise_id): Path<Uuid>,
    Query(params): Query<ProgressParams>,
) -> AppResult<Json<Progress>> {
    let pool = &state.pool;
    let tz = timezone_of(pool, user_id).await?;

    // Resolve to the canonical exercise; only official ones and the caller's own are visible.
    let exercise = sqlx::query!(
        r#"select c.id as "id!", c.name as "name!", c.kind as "kind!: ExerciseKind"
             from exercises e
             join exercises c on c.id = coalesce(e.merged_into_id, e.id)
            where e.id = $1 and e.deleted_at is null
              and (e.status = 'official' or e.created_by = $2)"#,
        exercise_id,
        user_id
    )
    .fetch_optional(pool)
    .await?
    .ok_or(AppError::NotFound)?;

    let rows = sqlx::query!(
        r#"select w.id as workout_id, (w.started_at at time zone $3::text)::date as "date!",
                  s.weight_kg, s.reps, s.duration_s, s.distance_m
             from workout_exercises we
             join workouts w on w.id = we.workout_id
             join sets s on s.workout_exercise_id = we.id
            where w.user_id = $1 and w.deleted_at is null
              and we.deleted_at is null and s.deleted_at is null and s.set_type <> 'warmup'
              and we.exercise_id in (select id from exercises where id = $2 or merged_into_id = $2)
              and ($4::text is null or we.variant_key = $4)
            order by w.started_at, w.id, we.position, s.position"#,
        user_id,
        exercise.id,
        tz,
        params.variant_key
    )
    .fetch_all(pool)
    .await?;

    // Rows arrive grouped by workout in time order; fold each group into one point.
    let mut points: Vec<Point> = Vec::new();
    let mut current: Option<(Uuid, String, Vec<SetRow>)> = None;
    for r in rows {
        let set = SetRow {
            weight: r.weight_kg.and_then(|d| d.to_f64()),
            reps: r.reps,
            duration_s: r.duration_s,
            distance_m: r.distance_m.and_then(|d| d.to_f64()),
        };
        match &mut current {
            Some((id, _, sets)) if *id == r.workout_id => sets.push(set),
            _ => {
                if let Some((id, date, sets)) = current.take() {
                    points.push(point_from_sets(date, id, &sets));
                }
                current = Some((r.workout_id, r.date.to_string(), vec![set]));
            }
        }
    }
    if let Some((id, date, sets)) = current {
        points.push(point_from_sets(date, id, &sets));
    }

    let records = Records {
        top_weight_kg: record_of(&points, |p| p.top_weight_kg),
        best_e1rm_kg: record_of(&points, |p| p.best_e1rm_kg),
        best_volume_kg: record_of(&points, |p| p.volume_kg),
        top_reps: record_of(&points, |p| p.top_reps),
        best_duration_s: record_of(&points, |p| p.best_duration_s),
        best_distance_m: record_of(&points, |p| p.best_distance_m),
    };

    Ok(Json(Progress {
        exercise_id: exercise.id,
        name: exercise.name,
        kind: exercise.kind,
        variant_key: params.variant_key,
        points,
        records,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn date(y: i32, m: u8, d: u8) -> Date {
        Date::from_calendar_date(y, time::Month::try_from(m).unwrap(), d).unwrap()
    }

    #[test]
    fn weeks_run_monday_to_sunday() {
        // 2026-10-26 is a Monday.
        assert_eq!(date(2026, 10, 26).weekday(), time::Weekday::Monday);
        let monday = week_id(date(2026, 10, 26));
        assert_eq!(week_id(date(2026, 11, 1)), monday, "Sunday belongs to the Monday before it");
        assert_eq!(week_id(date(2026, 10, 25)), monday - 1, "the previous Sunday is the earlier week");
        assert_eq!(week_id(date(2026, 11, 2)), monday + 1);
    }

    #[test]
    fn streaks_count_consecutive_weeks() {
        let set = |ws: &[i64]| ws.iter().copied().collect::<BTreeSet<_>>();
        assert_eq!(week_streaks(&set(&[]), 100), (0, 0));
        assert_eq!(week_streaks(&set(&[100, 99, 98, 90, 89, 88, 87]), 100), (3, 4));
        // Nothing logged yet this week: last week's run continues.
        assert_eq!(week_streaks(&set(&[99, 98]), 100), (2, 2));
        // A week missed entirely breaks it.
        assert_eq!(week_streaks(&set(&[98, 97]), 100), (0, 2));
        assert_eq!(week_streaks(&set(&[100]), 100), (1, 1));
    }

    #[test]
    fn one_rep_max_estimates() {
        assert_eq!(estimated_1rm(100.0, 1), Some(100.0));
        assert!((estimated_1rm(40.0, 8).unwrap() - 50.666_666).abs() < 1e-4);
        assert_eq!(estimated_1rm(40.0, 13), None, "high-rep sets are too unreliable to extrapolate");
        assert_eq!(estimated_1rm(40.0, 0), None);
        assert_eq!(estimated_1rm(0.0, 5), None);
    }

    #[test]
    fn labels_use_catalog_names_in_key_order() {
        let names: HashMap<String, String> =
            [("ez-bar".into(), "EZ Bar".into()), ("preacher".into(), "Preacher".into())].into();
        assert_eq!(variant_label("ez-bar+preacher", &names), "EZ Bar + Preacher");
        assert_eq!(variant_label("", &names), "");
        assert_eq!(variant_label("mystery", &names), "mystery");
    }
}
