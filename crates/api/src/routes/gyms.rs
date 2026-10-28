use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, put},
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::{
    AppState,
    auth::AuthUser,
    error::{AppError, AppResult},
};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/gyms", get(search).post(create))
        .route("/me/gyms", get(my_gyms))
        .route("/me/gyms/{id}/default", put(set_default))
}

#[derive(Serialize)]
struct GymOut {
    id: Uuid,
    name: String,
    chain: Option<String>,
    address: Option<String>,
    city: Option<String>,
    verified: bool,
}

#[derive(Serialize)]
struct MyGymOut {
    id: Uuid,
    name: String,
    chain: Option<String>,
    address: Option<String>,
    city: Option<String>,
    verified: bool,
    is_default: bool,
}

#[derive(Deserialize)]
struct SearchParams {
    #[serde(default)]
    q: String,
    limit: Option<i64>,
}

/// Name search by trigram similarity or substring. Both sides are normalised
/// (lowercase, apostrophes dropped, other punctuation to spaces) so "gold's gym"
/// finds "Golds Gym". An empty query lists the caller's saved gyms first.
async fn search(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Query(params): Query<SearchParams>,
) -> AppResult<Json<Vec<GymOut>>> {
    let limit = params.limit.unwrap_or(20).clamp(1, 50);
    let rows = sqlx::query_as!(
        GymOut,
        r#"with q as (
               select btrim(lower(regexp_replace(replace(replace($1::text, '''', ''), '’', ''),
                                                 '[^[:alnum:]]+', ' ', 'g'))) as nq
           ), scored as (
               select g.id, g.name, g.chain, g.address, g.city, g.verified,
                      exists (select 1 from user_gyms ug where ug.gym_id = g.id and ug.user_id = $2) as saved,
                      similarity(n.nname, q.nq) as score,
                      n.nname like '%' || q.nq || '%' as contains
                 from gyms g
                 cross join q
                 cross join lateral (
                     select btrim(lower(regexp_replace(replace(replace(g.name, '''', ''), '’', ''),
                                                       '[^[:alnum:]]+', ' ', 'g'))) as nname
                 ) n
                where g.deleted_at is null
           )
           select id as "id!", name as "name!", chain, address, city, verified as "verified!"
             from scored, q
            where q.nq = '' or contains or score > 0.3
            order by (case when q.nq = '' then saved else contains end) desc,
                     (case when q.nq = '' then 0 else score end) desc, name
            limit $3"#,
        params.q,
        user_id,
        limit
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(rows))
}

#[derive(Deserialize)]
struct CreateGym {
    name: String,
    chain: Option<String>,
    address: Option<String>,
    city: Option<String>,
    #[serde(default)]
    force: bool,
}

/// Blank optional strings are stored as null.
fn clean(v: Option<String>) -> Option<String> {
    v.map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

/// Refuses to create a near-duplicate unless `force` is set; the 409 lists the
/// candidates so the client can offer them instead.
async fn create(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Json(body): Json<CreateGym>,
) -> AppResult<(StatusCode, Json<GymOut>)> {
    let name = body.name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::BadRequest("name must not be empty".into()));
    }
    let (chain, address, city) = (clean(body.chain), clean(body.address), clean(body.city));

    if !body.force {
        let similar = sqlx::query_as!(
            GymOut,
            r#"with q as (
                   select btrim(lower(regexp_replace(replace(replace($1::text, '''', ''), '’', ''),
                                                     '[^[:alnum:]]+', ' ', 'g'))) as nq
               ), cand as (
                   select g.id, g.name, g.chain, g.address, g.city, g.verified,
                          similarity(btrim(lower(regexp_replace(replace(replace(g.name, '''', ''), '’', ''),
                                                                '[^[:alnum:]]+', ' ', 'g'))), q.nq) as score
                     from gyms g, q
                    where g.deleted_at is null
                      and ($2::text is null or lower(g.city) = lower($2))
               )
               select id as "id!", name as "name!", chain, address, city, verified as "verified!"
                 from cand
                where score > 0.5
                order by score desc, name
                limit 10"#,
            name,
            city
        )
        .fetch_all(&state.pool)
        .await?;
        if !similar.is_empty() {
            return Err(AppError::ConflictWith {
                message: "similar gyms exist".into(),
                extra: json!({ "similar": similar }),
            });
        }
    }

    let mut tx = state.pool.begin().await?;
    let gym = sqlx::query_as!(
        GymOut,
        "insert into gyms (name, chain, address, city, created_by)
         values ($1, $2, $3, $4, $5)
         returning id, name, chain, address, city, verified",
        name,
        chain,
        address,
        city,
        user_id
    )
    .fetch_one(&mut *tx)
    .await?;
    sqlx::query!(
        "insert into user_gyms (user_id, gym_id, is_default)
         values ($1, $2, not exists (select 1 from user_gyms where user_id = $1 and is_default))",
        user_id,
        gym.id
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok((StatusCode::CREATED, Json(gym)))
}

async fn my_gyms(State(state): State<AppState>, AuthUser(user_id): AuthUser) -> AppResult<Json<Vec<MyGymOut>>> {
    let rows = sqlx::query_as!(
        MyGymOut,
        r#"select g.id, g.name, g.chain, g.address, g.city, g.verified, ug.is_default
             from user_gyms ug
             join gyms g on g.id = ug.gym_id
            where ug.user_id = $1 and g.deleted_at is null
            order by ug.is_default desc, g.name"#,
        user_id
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(rows))
}

/// Saves the gym if needed and makes it the caller's only default.
async fn set_default(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(gym_id): Path<Uuid>,
) -> AppResult<StatusCode> {
    let mut tx = state.pool.begin().await?;
    sqlx::query_scalar!("select id from gyms where id = $1 and deleted_at is null", gym_id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(AppError::NotFound)?;
    // Clear first: the partial unique index allows only one default per user.
    sqlx::query!("update user_gyms set is_default = false where user_id = $1 and is_default", user_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query!(
        "insert into user_gyms (user_id, gym_id, is_default) values ($1, $2, true)
         on conflict (user_id, gym_id) do update set is_default = true",
        user_id,
        gym_id
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}
