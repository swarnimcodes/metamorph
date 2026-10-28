use axum::{Json, Router, extract::{Query, State}, routing::get};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    AppState,
    auth::AuthUser,
    error::AppResult,
    models::{ExerciseKind, ExerciseStatus, TagCategory},
};

pub fn routes() -> Router<AppState> {
    Router::new().route("/exercises", get(search)).route("/tags", get(tags))
}

#[derive(Deserialize)]
struct SearchParams {
    #[serde(default)]
    q: String,
    limit: Option<i64>,
}

#[derive(Serialize)]
struct ExerciseOut {
    id: Uuid,
    slug: Option<String>,
    name: String,
    kind: ExerciseKind,
    status: ExerciseStatus,
}

/// Matches canonical names and aliases. The query is normalised the same way
/// as `exercise_aliases.alias_normalized` (lowercase, punctuation to spaces).
/// Official exercises and the caller's own are visible; merged and deleted ones are not.
async fn search(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Query(params): Query<SearchParams>,
) -> AppResult<Json<Vec<ExerciseOut>>> {
    let limit = params.limit.unwrap_or(20).clamp(1, 50);
    let rows = sqlx::query_as!(
        ExerciseOut,
        r#"with q as (
               select btrim(lower(regexp_replace($1::text, '[^[:alnum:]]+', ' ', 'g'))) as nq
           ), cand as (
               select e.id, e.slug, e.name, e.kind, e.status,
                      btrim(lower(regexp_replace(e.name, '[^[:alnum:]]+', ' ', 'g'))) as nname
                 from exercises e
                where e.deleted_at is null
                  and e.merged_into_id is null
                  and (e.status = 'official' or e.created_by = $2)
           ), scored as (
               select c.*,
                      greatest(
                          similarity(c.nname, q.nq),
                          coalesce((select max(similarity(a.alias_normalized, q.nq))
                                      from exercise_aliases a where a.exercise_id = c.id), 0)
                      ) as score,
                      (c.nname like '%' || q.nq || '%'
                       or exists (select 1 from exercise_aliases a
                                   where a.exercise_id = c.id
                                     and a.alias_normalized like '%' || q.nq || '%')) as contains
                 from cand c, q
           )
           select id as "id!", slug, name as "name!",
                  kind as "kind!: ExerciseKind", status as "status!: ExerciseStatus"
             from scored, q
            where q.nq = '' or contains or score > 0.3
            order by (case when q.nq = '' then 0 when contains then 1 else 0 end) desc,
                     score desc, name
            limit $3"#,
        params.q,
        user_id,
        limit
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(rows))
}

#[derive(Serialize)]
struct TagOut {
    id: Uuid,
    slug: String,
    name: String,
    category: TagCategory,
}

async fn tags(State(state): State<AppState>, _user: AuthUser) -> AppResult<Json<Vec<TagOut>>> {
    let rows = sqlx::query_as!(
        TagOut,
        r#"select id, slug, name, category as "category: TagCategory"
             from variation_tags order by category, name"#
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(rows))
}
