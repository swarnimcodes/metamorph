use std::collections::HashMap;

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{delete, get, patch, post},
};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use time::OffsetDateTime;
use uuid::Uuid;

use crate::{
    AppState,
    auth::AuthUser,
    error::{AppError, AppResult},
    models::{SetType, TagCategory},
};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/workouts", post(create).get(list))
        .route("/workouts/{id}", get(detail).patch(update).delete(remove))
        .route("/workouts/{id}/finish", post(finish))
        .route("/workouts/{id}/exercises", post(add_exercise))
        .route("/exercises/{id}/last", get(last_performance))
        .route("/workout-exercises/{id}", delete(remove_exercise))
        .route("/workout-exercises/{id}/sets", post(add_set))
        .route("/sets/{id}", patch(update_set).delete(remove_set))
}

// Every query below filters by the caller's user_id (directly or through the
// workout), so a valid id belonging to someone else is indistinguishable from
// a missing one and yields 404.

#[derive(Serialize)]
pub struct TagOut {
    id: Uuid,
    slug: String,
    name: String,
    category: TagCategory,
}

#[derive(Serialize)]
pub struct SetOut {
    id: Uuid,
    position: i32,
    set_type: SetType,
    weight_kg: Option<Decimal>,
    reps: Option<i32>,
    duration_s: Option<i32>,
    distance_m: Option<Decimal>,
    rpe: Option<Decimal>,
    note: Option<String>,
    #[serde(with = "time::serde::rfc3339::option")]
    completed_at: Option<OffsetDateTime>,
}

#[derive(Serialize)]
pub struct WorkoutExerciseOut {
    id: Uuid,
    exercise_id: Uuid,
    exercise_name: String,
    position: i32,
    variant_key: String,
    superset_group: Option<i32>,
    notes: Option<String>,
    tags: Vec<TagOut>,
    sets: Vec<SetOut>,
}

#[derive(Serialize)]
pub struct WorkoutOut {
    id: Uuid,
    title: Option<String>,
    gym_id: Option<Uuid>,
    #[serde(with = "time::serde::rfc3339")]
    started_at: OffsetDateTime,
    #[serde(with = "time::serde::rfc3339::option")]
    ended_at: Option<OffsetDateTime>,
    notes: Option<String>,
    exercises: Vec<WorkoutExerciseOut>,
}

#[derive(Serialize)]
pub struct WorkoutSummary {
    id: Uuid,
    title: Option<String>,
    gym_id: Option<Uuid>,
    #[serde(with = "time::serde::rfc3339")]
    started_at: OffsetDateTime,
    #[serde(with = "time::serde::rfc3339::option")]
    ended_at: Option<OffsetDateTime>,
    exercise_count: i64,
    set_count: i64,
}

async fn load_workout(pool: &PgPool, user_id: Uuid, id: Uuid) -> AppResult<WorkoutOut> {
    let w = sqlx::query!(
        "select id, title, gym_id, started_at, ended_at, notes
           from workouts where id = $1 and user_id = $2 and deleted_at is null",
        id,
        user_id
    )
    .fetch_optional(pool)
    .await?
    .ok_or(AppError::NotFound)?;

    let exercises = sqlx::query!(
        "select we.id, we.exercise_id, e.name as exercise_name, we.position,
                we.variant_key, we.superset_group, we.notes
           from workout_exercises we
           join exercises e on e.id = we.exercise_id
          where we.workout_id = $1 and we.deleted_at is null
          order by we.position, we.created_at",
        id
    )
    .fetch_all(pool)
    .await?;

    let tag_rows = sqlx::query!(
        r#"select wt.workout_exercise_id, t.id, t.slug, t.name,
                  t.category as "category: TagCategory"
             from workout_exercise_tags wt
             join variation_tags t on t.id = wt.tag_id
             join workout_exercises we on we.id = wt.workout_exercise_id
            where we.workout_id = $1
            order by t.slug"#,
        id
    )
    .fetch_all(pool)
    .await?;

    let set_rows = sqlx::query!(
        r#"select s.id, s.workout_exercise_id, s.position,
                  s.set_type as "set_type: SetType",
                  s.weight_kg, s.reps, s.duration_s, s.distance_m, s.rpe, s.note, s.completed_at
             from sets s
             join workout_exercises we on we.id = s.workout_exercise_id
            where we.workout_id = $1 and we.deleted_at is null and s.deleted_at is null
            order by s.position, s.created_at"#,
        id
    )
    .fetch_all(pool)
    .await?;

    let mut tags: HashMap<Uuid, Vec<TagOut>> = HashMap::new();
    for t in tag_rows {
        tags.entry(t.workout_exercise_id).or_default().push(TagOut {
            id: t.id,
            slug: t.slug,
            name: t.name,
            category: t.category,
        });
    }
    let mut sets: HashMap<Uuid, Vec<SetOut>> = HashMap::new();
    for s in set_rows {
        sets.entry(s.workout_exercise_id).or_default().push(SetOut {
            id: s.id,
            position: s.position,
            set_type: s.set_type,
            weight_kg: s.weight_kg,
            reps: s.reps,
            duration_s: s.duration_s,
            distance_m: s.distance_m,
            rpe: s.rpe,
            note: s.note,
            completed_at: s.completed_at,
        });
    }

    Ok(WorkoutOut {
        id: w.id,
        title: w.title,
        gym_id: w.gym_id,
        started_at: w.started_at,
        ended_at: w.ended_at,
        notes: w.notes,
        exercises: exercises
            .into_iter()
            .map(|e| WorkoutExerciseOut {
                tags: tags.remove(&e.id).unwrap_or_default(),
                sets: sets.remove(&e.id).unwrap_or_default(),
                id: e.id,
                exercise_id: e.exercise_id,
                exercise_name: e.exercise_name,
                position: e.position,
                variant_key: e.variant_key,
                superset_group: e.superset_group,
                notes: e.notes,
            })
            .collect(),
    })
}

#[derive(Deserialize)]
struct LastParams {
    #[serde(default)]
    variant_key: String,
}

#[derive(Serialize)]
struct LastPerformance {
    workout_id: Uuid,
    #[serde(with = "time::serde::rfc3339")]
    started_at: OffsetDateTime,
    sets: Vec<SetOut>,
}

/// The caller's most recent logged sets for an exercise with this exact variant,
/// used to prefill a new set. A merged exercise resolves to its target, and
/// entries logged against the merged-away duplicates still count.
async fn last_performance(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(exercise_id): Path<Uuid>,
    Query(params): Query<LastParams>,
) -> AppResult<Json<LastPerformance>> {
    let entry = sqlx::query!(
        r#"with recursive chain as (
               select id, merged_into_id from exercises where id = $1
               union all
               select e.id, e.merged_into_id from exercises e join chain c on e.id = c.merged_into_id
           ), target as (
               select id from chain where merged_into_id is null
           )
           select we.id, w.id as workout_id, w.started_at
             from workout_exercises we
             join workouts w on w.id = we.workout_id
            where w.user_id = $2 and w.deleted_at is null and we.deleted_at is null
              and we.variant_key = $3
              and (we.exercise_id in (select id from target)
                   or we.exercise_id in (select id from exercises
                                          where merged_into_id in (select id from target)))
            order by w.started_at desc, we.created_at desc
            limit 1"#,
        exercise_id,
        user_id,
        params.variant_key
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::NotFound)?;

    let sets = sqlx::query_as!(
        SetOut,
        r#"select id, position, set_type as "set_type: SetType",
                  weight_kg, reps, duration_s, distance_m, rpe, note, completed_at
             from sets
            where workout_exercise_id = $1 and deleted_at is null
            order by position, created_at"#,
        entry.id
    )
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(LastPerformance { workout_id: entry.workout_id, started_at: entry.started_at, sets }))
}

#[derive(Deserialize)]
struct CreateWorkout {
    title: Option<String>,
    gym_id: Option<Uuid>,
    notes: Option<String>,
    #[serde(default, with = "time::serde::rfc3339::option")]
    started_at: Option<OffsetDateTime>,
}

async fn create(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Json(body): Json<CreateWorkout>,
) -> AppResult<(StatusCode, Json<WorkoutOut>)> {
    let id = sqlx::query_scalar!(
        r#"insert into workouts (user_id, title, gym_id, notes, started_at)
           values ($1, $2, $3, $4, coalesce($5, now()))
           returning id"#,
        user_id,
        body.title,
        body.gym_id,
        body.notes,
        body.started_at
    )
    .fetch_one(&state.pool)
    .await?;
    Ok((StatusCode::CREATED, Json(load_workout(&state.pool, user_id, id).await?)))
}

#[derive(Deserialize)]
struct ListParams {
    limit: Option<i64>,
    /// Only workouts started before this instant (RFC 3339, URL-encode any `+`).
    #[serde(default, with = "time::serde::rfc3339::option")]
    before: Option<OffsetDateTime>,
}

async fn list(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Query(params): Query<ListParams>,
) -> AppResult<Json<Vec<WorkoutSummary>>> {
    let limit = params.limit.unwrap_or(20).clamp(1, 100);
    let rows = sqlx::query_as!(
        WorkoutSummary,
        r#"select w.id, w.title, w.gym_id, w.started_at, w.ended_at,
                  (select count(*) from workout_exercises we
                    where we.workout_id = w.id and we.deleted_at is null) as "exercise_count!",
                  (select count(*) from sets s
                     join workout_exercises we on we.id = s.workout_exercise_id
                    where we.workout_id = w.id and we.deleted_at is null
                      and s.deleted_at is null) as "set_count!"
             from workouts w
            where w.user_id = $1 and w.deleted_at is null
              and ($2::timestamptz is null or w.started_at < $2)
            order by w.started_at desc
            limit $3"#,
        user_id,
        params.before,
        limit
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(rows))
}

async fn detail(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<WorkoutOut>> {
    Ok(Json(load_workout(&state.pool, user_id, id).await?))
}

/// Omitted fields are left unchanged; a field cannot be cleared back to null.
#[derive(Deserialize)]
struct UpdateWorkout {
    title: Option<String>,
    notes: Option<String>,
    gym_id: Option<Uuid>,
    #[serde(default, with = "time::serde::rfc3339::option")]
    started_at: Option<OffsetDateTime>,
    #[serde(default, with = "time::serde::rfc3339::option")]
    ended_at: Option<OffsetDateTime>,
}

async fn update(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateWorkout>,
) -> AppResult<Json<WorkoutOut>> {
    let updated = sqlx::query_scalar!(
        r#"update workouts
              set title = coalesce($3, title),
                  notes = coalesce($4, notes),
                  gym_id = coalesce($5, gym_id),
                  started_at = coalesce($6, started_at),
                  ended_at = coalesce($7, ended_at)
            where id = $1 and user_id = $2 and deleted_at is null
        returning id"#,
        id,
        user_id,
        body.title,
        body.notes,
        body.gym_id,
        body.started_at,
        body.ended_at
    )
    .fetch_optional(&state.pool)
    .await?;
    updated.ok_or(AppError::NotFound)?;
    Ok(Json(load_workout(&state.pool, user_id, id).await?))
}

/// Marks the workout as ended now. Finishing twice keeps the first end time.
async fn finish(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<WorkoutOut>> {
    let updated = sqlx::query_scalar!(
        r#"update workouts set ended_at = coalesce(ended_at, now())
            where id = $1 and user_id = $2 and deleted_at is null
        returning id"#,
        id,
        user_id
    )
    .fetch_optional(&state.pool)
    .await?;
    updated.ok_or(AppError::NotFound)?;
    Ok(Json(load_workout(&state.pool, user_id, id).await?))
}

async fn remove(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<StatusCode> {
    let deleted = sqlx::query_scalar!(
        "update workouts set deleted_at = now()
          where id = $1 and user_id = $2 and deleted_at is null
      returning id",
        id,
        user_id
    )
    .fetch_optional(&state.pool)
    .await?;
    deleted.ok_or(AppError::NotFound)?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
struct AddExercise {
    exercise_id: Uuid,
    #[serde(default)]
    tag_ids: Vec<Uuid>,
    superset_group: Option<i32>,
    notes: Option<String>,
}

async fn add_exercise(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(workout_id): Path<Uuid>,
    Json(body): Json<AddExercise>,
) -> AppResult<(StatusCode, Json<WorkoutExerciseOut>)> {
    let mut tx = state.pool.begin().await?;

    // Lock the workout row so concurrent adds get distinct positions.
    sqlx::query_scalar!(
        "select id from workouts where id = $1 and user_id = $2 and deleted_at is null for update",
        workout_id,
        user_id
    )
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(AppError::NotFound)?;

    // Follow a merge pointer so history lands on the canonical exercise.
    let exercise_id = sqlx::query_scalar!(
        r#"select coalesce(merged_into_id, id) as "id!" from exercises
            where id = $1 and deleted_at is null
              and (status = 'official' or created_by = $2)"#,
        body.exercise_id,
        user_id
    )
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::BadRequest("unknown exercise".into()))?;

    let position = sqlx::query_scalar!(
        r#"select coalesce(max(position), 0) + 1 as "pos!" from workout_exercises
            where workout_id = $1 and deleted_at is null"#,
        workout_id
    )
    .fetch_one(&mut *tx)
    .await?;

    let we_id = sqlx::query_scalar!(
        r#"insert into workout_exercises (workout_id, exercise_id, position, superset_group, notes)
           values ($1, $2, $3, $4, $5) returning id"#,
        workout_id,
        exercise_id,
        position,
        body.superset_group,
        body.notes
    )
    .fetch_one(&mut *tx)
    .await?;

    // The tag trigger recomputes variant_key for each inserted row.
    sqlx::query!(
        "insert into workout_exercise_tags (workout_exercise_id, tag_id)
         select $1, unnest($2::uuid[]) on conflict do nothing",
        we_id,
        &body.tag_ids
    )
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    let workout = load_workout(&state.pool, user_id, workout_id).await?;
    let created = workout
        .exercises
        .into_iter()
        .find(|e| e.id == we_id)
        .ok_or(AppError::NotFound)?;
    Ok((StatusCode::CREATED, Json(created)))
}

async fn remove_exercise(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<StatusCode> {
    let mut tx = state.pool.begin().await?;
    sqlx::query_scalar!(
        r#"update workout_exercises we set deleted_at = now()
             from workouts w
            where we.id = $1 and w.id = we.workout_id and w.user_id = $2
              and w.deleted_at is null and we.deleted_at is null
        returning we.id"#,
        id,
        user_id
    )
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(AppError::NotFound)?;
    sqlx::query!(
        "update sets set deleted_at = now() where workout_exercise_id = $1 and deleted_at is null",
        id
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
struct NewSet {
    set_type: Option<SetType>,
    weight_kg: Option<Decimal>,
    reps: Option<i32>,
    duration_s: Option<i32>,
    distance_m: Option<Decimal>,
    rpe: Option<Decimal>,
    note: Option<String>,
    #[serde(default, with = "time::serde::rfc3339::option")]
    completed_at: Option<OffsetDateTime>,
}

async fn add_set(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(we_id): Path<Uuid>,
    Json(body): Json<NewSet>,
) -> AppResult<(StatusCode, Json<SetOut>)> {
    let mut tx = state.pool.begin().await?;

    sqlx::query_scalar!(
        r#"select we.id from workout_exercises we
             join workouts w on w.id = we.workout_id
            where we.id = $1 and w.user_id = $2
              and w.deleted_at is null and we.deleted_at is null
              for update of we"#,
        we_id,
        user_id
    )
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(AppError::NotFound)?;

    let position = sqlx::query_scalar!(
        r#"select coalesce(max(position), 0) + 1 as "pos!" from sets
            where workout_exercise_id = $1 and deleted_at is null"#,
        we_id
    )
    .fetch_one(&mut *tx)
    .await?;

    let set = sqlx::query_as!(
        SetOut,
        r#"insert into sets (workout_exercise_id, position, set_type, weight_kg, reps,
                             duration_s, distance_m, rpe, note, completed_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, coalesce($10, now()))
        returning id, position, set_type as "set_type: SetType", weight_kg, reps,
                  duration_s, distance_m, rpe, note, completed_at"#,
        we_id,
        position,
        body.set_type.unwrap_or(SetType::Working) as SetType,
        body.weight_kg,
        body.reps,
        body.duration_s,
        body.distance_m,
        body.rpe,
        body.note,
        body.completed_at
    )
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok((StatusCode::CREATED, Json(set)))
}

/// Omitted fields are left unchanged; a field cannot be cleared back to null.
#[derive(Deserialize)]
struct UpdateSet {
    set_type: Option<SetType>,
    weight_kg: Option<Decimal>,
    reps: Option<i32>,
    duration_s: Option<i32>,
    distance_m: Option<Decimal>,
    rpe: Option<Decimal>,
    note: Option<String>,
    #[serde(default, with = "time::serde::rfc3339::option")]
    completed_at: Option<OffsetDateTime>,
}

async fn update_set(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateSet>,
) -> AppResult<Json<SetOut>> {
    let set = sqlx::query_as!(
        SetOut,
        r#"update sets s
              set set_type = coalesce($3, s.set_type),
                  weight_kg = coalesce($4, s.weight_kg),
                  reps = coalesce($5, s.reps),
                  duration_s = coalesce($6, s.duration_s),
                  distance_m = coalesce($7, s.distance_m),
                  rpe = coalesce($8, s.rpe),
                  note = coalesce($9, s.note),
                  completed_at = coalesce($10, s.completed_at)
             from workout_exercises we, workouts w
            where s.id = $1 and we.id = s.workout_exercise_id and w.id = we.workout_id
              and w.user_id = $2 and w.deleted_at is null
              and we.deleted_at is null and s.deleted_at is null
        returning s.id, s.position, s.set_type as "set_type: SetType", s.weight_kg, s.reps,
                  s.duration_s, s.distance_m, s.rpe, s.note, s.completed_at"#,
        id,
        user_id,
        body.set_type as Option<SetType>,
        body.weight_kg,
        body.reps,
        body.duration_s,
        body.distance_m,
        body.rpe,
        body.note,
        body.completed_at
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::NotFound)?;
    Ok(Json(set))
}

async fn remove_set(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<StatusCode> {
    sqlx::query_scalar!(
        r#"update sets s set deleted_at = now()
             from workout_exercises we, workouts w
            where s.id = $1 and we.id = s.workout_exercise_id and w.id = we.workout_id
              and w.user_id = $2 and w.deleted_at is null
              and we.deleted_at is null and s.deleted_at is null
        returning s.id"#,
        id,
        user_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::NotFound)?;
    Ok(StatusCode::NO_CONTENT)
}
