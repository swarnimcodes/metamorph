use axum::{
    Json, Router,
    extract::{Query, State},
    http::StatusCode,
    routing::get,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::{
    AppState,
    extract::AppJson,
    auth::AuthUser,
    error::{AppError, AppResult},
};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/gyms", get(search).post(create))
}

#[derive(Serialize)]
struct GymOut {
    id: Uuid,
    name: String,
    chain: Option<String>,
    area: Option<String>,
    address: Option<String>,
    city: Option<String>,
    lat: Option<f64>,
    lng: Option<f64>,
    maps_url: Option<String>,
    verified: bool,
}

#[derive(Deserialize)]
struct SearchParams {
    #[serde(default)]
    q: String,
    limit: Option<i64>,
}

/// Name search by trigram similarity or substring. Both sides are normalised
/// (lowercase, apostrophes dropped, other punctuation to spaces) so "gold's gym"
/// finds "Golds Gym". Gyms the caller trained at most recently come first, then verified ones.
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
               select g.id, g.name, g.chain, g.area, g.address, g.city, g.lat, g.lng, g.maps_url, g.verified,
                      (select max(w.started_at) from workouts w
                        where w.gym_id = g.id and w.user_id = $2 and w.deleted_at is null) as last_used,
                      similarity(n.nname, q.nq) as score,
                      -- every word of the query appears in the name, area or city, in any order
                      not exists (
                          select 1 from unnest(string_to_array(q.nq, ' ')) as w
                           where w <> '' and n.hay not like '%' || w || '%'
                      ) as contains
                 from gyms g
                 cross join q
                 cross join lateral (
                     select btrim(lower(regexp_replace(replace(replace(g.name, '''', ''), '’', ''),
                                                       '[^[:alnum:]]+', ' ', 'g'))) as nname,
                            btrim(lower(regexp_replace(replace(replace(
                                g.name || ' ' || coalesce(g.area, '') || ' ' || coalesce(g.city, ''), '''', ''), '’', ''),
                                '[^[:alnum:]]+', ' ', 'g'))) as hay
                 ) n
                where g.deleted_at is null
           )
           select id as "id!", name as "name!", chain, area, address, city, lat, lng, maps_url, verified as "verified!"
             from scored, q
            where q.nq = '' or contains or score > 0.3
            order by (case when q.nq = '' then true else contains end) desc,
                     (case when q.nq = '' then 0 else score end) desc,
                     last_used desc nulls last, verified desc, name
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
    area: Option<String>,
    address: Option<String>,
    city: Option<String>,
    maps_url: Option<String>,
    #[serde(default)]
    force: bool,
}

/// Only links to a known maps service are kept: the directory is shared, so a stored link
/// is opened by other people and must not be an arbitrary site.
fn valid_maps_url(url: &str) -> bool {
    const HOSTS: [&str; 7] = [
        "maps.app.goo.gl",
        "goo.gl",
        "maps.google.com",
        "www.google.com",
        "google.com",
        "maps.apple.com",
        "www.openstreetmap.org",
    ];
    let Some(rest) = url.strip_prefix("https://") else { return false };
    let (host, path) = rest.split_once('/').unwrap_or((rest, ""));
    if !HOSTS.contains(&host) || url.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return false;
    }
    // google.com and goo.gl host other products; only their maps paths count.
    match host {
        "www.google.com" | "google.com" | "goo.gl" => path.starts_with("maps"),
        _ => true,
    }
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
    AppJson(body): AppJson<CreateGym>,
) -> AppResult<(StatusCode, Json<GymOut>)> {
    let name = body.name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::BadRequest("name must not be empty".into()));
    }
    let (chain, area, address, city) =
        (clean(body.chain), clean(body.area), clean(body.address), clean(body.city));
    let maps_url = clean(body.maps_url);
    if let Some(url) = &maps_url
        && !valid_maps_url(url)
    {
        return Err(AppError::BadRequest("maps_url must be a link to Google Maps, Apple Maps or OpenStreetMap".into()));
    }

    if !body.force {
        let similar = sqlx::query_as!(
            GymOut,
            r#"with q as (
                   select btrim(lower(regexp_replace(replace(replace($1::text, '''', ''), '’', ''),
                                                     '[^[:alnum:]]+', ' ', 'g'))) as nq
               ), cand as (
                   select g.id, g.name, g.chain, g.area, g.address, g.city, g.lat, g.lng, g.maps_url, g.verified,
                          similarity(btrim(lower(regexp_replace(replace(replace(g.name, '''', ''), '’', ''),
                                                                '[^[:alnum:]]+', ' ', 'g'))), q.nq) as score
                     from gyms g, q
                    where g.deleted_at is null
                      and ($2::text is null or lower(g.city) = lower($2))
               )
               select id as "id!", name as "name!", chain, area, address, city, lat, lng, maps_url,
                      verified as "verified!"
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

    let gym = sqlx::query_as!(
        GymOut,
        "insert into gyms (name, chain, area, address, city, maps_url, created_by)
         values ($1, $2, $3, $4, $5, $6, $7)
         returning id, name, chain, area, address, city, lat, lng, maps_url, verified",
        name,
        chain,
        area,
        address,
        city,
        maps_url,
        user_id
    )
    .fetch_one(&state.pool)
    .await?;
    Ok((StatusCode::CREATED, Json(gym)))
}
