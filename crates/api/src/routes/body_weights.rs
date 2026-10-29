//! A daily weigh-in log: one entry per user per local calendar day.
//!
//! The client sends the date in the user's own timezone, so there is no timezone
//! conversion here; a day cannot be in the future for that user.

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, put},
};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use time::{Date, macros::format_description};
use uuid::Uuid;

use crate::{
    AppState,
    auth::AuthUser,
    error::{AppError, AppResult},
    extract::AppJson,
};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/body-weights", get(list))
        .route("/body-weights/{date}", put(upsert).delete(remove))
}

fn parse_date(s: &str) -> AppResult<Date> {
    Date::parse(s, format_description!("[year]-[month]-[day]"))
        .map_err(|_| AppError::BadRequest("date must be YYYY-MM-DD".into()))
}

#[derive(Serialize)]
struct Entry {
    date: String,
    weight_kg: Decimal,
}

#[derive(Deserialize)]
struct ListParams {
    from: Option<String>,
    to: Option<String>,
}

/// Most entries one request returns. Past it the oldest are dropped, never the newest.
const MAX_ENTRIES: i64 = 5000;

/// Oldest first, which is the order a chart wants.
async fn list(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Query(params): Query<ListParams>,
) -> AppResult<Json<Vec<Entry>>> {
    let from = params.from.as_deref().map(parse_date).transpose()?;
    let to = params.to.as_deref().map(parse_date).transpose()?;
    let rows = sqlx::query_as!(
        Entry,
        r#"select "date!", "weight_kg!" from (
               select to_char(measured_on, 'YYYY-MM-DD') as "date!", weight_kg as "weight_kg!", measured_on
                 from body_weights
                where user_id = $1
                  and ($2::date is null or measured_on >= $2)
                  and ($3::date is null or measured_on <= $3)
                order by measured_on desc
                limit $4
           ) newest
           order by measured_on"#,
        user_id,
        from,
        to,
        MAX_ENTRIES
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(rows))
}

#[derive(Deserialize)]
struct WeighIn {
    weight_kg: Decimal,
}

async fn upsert(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(date): Path<String>,
    AppJson(body): AppJson<WeighIn>,
) -> AppResult<Json<Entry>> {
    let day = parse_date(&date)?;
    let weight_kg = body.weight_kg.round_dp(2);
    if weight_kg <= Decimal::ZERO || weight_kg >= Decimal::from(500) {
        return Err(AppError::BadRequest("weight_kg must be between 0 and 500".into()));
    }

    let today = sqlx::query_scalar!(
        r#"select (now() at time zone timezone)::date as "today!" from users where id = $1 and deleted_at is null"#,
        user_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::Unauthorized)?;
    if day > today {
        return Err(AppError::BadRequest("date cannot be in the future".into()));
    }

    let entry = sqlx::query_as!(
        Entry,
        r#"insert into body_weights (user_id, measured_on, weight_kg)
           values ($1, $2, $3)
           on conflict (user_id, measured_on) do update set weight_kg = excluded.weight_kg
        returning to_char(measured_on, 'YYYY-MM-DD') as "date!", weight_kg"#,
        user_id,
        day,
        weight_kg
    )
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(entry))
}

async fn remove(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(date): Path<String>,
) -> AppResult<StatusCode> {
    let day = parse_date(&date)?;
    sqlx::query_scalar!(
        "delete from body_weights where user_id = $1 and measured_on = $2 returning id as \"id: Uuid\"",
        user_id,
        day
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::NotFound)?;
    Ok(StatusCode::NO_CONTENT)
}
