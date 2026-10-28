use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, header::USER_AGENT},
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    AppState,
    auth::{AuthUser, Session, issue_session, rotate_session},
    error::{AppError, AppResult},
    models::UnitSystem,
};

pub fn routes() -> Router<AppState> {
    Router::new().route("/me", get(me)).route("/auth/refresh", post(refresh))
}

/// Only mounted when `DEV_LOGIN` is on.
pub fn dev_routes() -> Router<AppState> {
    Router::new().route("/auth/dev-login", post(dev_login))
}

#[derive(Serialize)]
struct Me {
    id: Uuid,
    username: String,
    display_name: String,
    email: String,
    avatar_url: Option<String>,
    unit_system: UnitSystem,
    timezone: String,
}

async fn me(State(state): State<AppState>, AuthUser(user_id): AuthUser) -> AppResult<Json<Me>> {
    let me = sqlx::query_as!(
        Me,
        r#"select id, username::text as "username!", display_name, email::text as "email!",
                  avatar_url, unit_system as "unit_system: UnitSystem", timezone
             from users where id = $1 and deleted_at is null"#,
        user_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::Unauthorized)?;
    Ok(Json(me))
}

#[derive(Deserialize)]
struct DevLogin {
    username: String,
    display_name: Option<String>,
}

#[derive(Serialize)]
struct LoginResponse {
    access_token: String,
    token_type: &'static str,
    expires_in: u64,
    refresh_token: String,
    refresh_expires_in: u64,
    user_id: Uuid,
    username: String,
}

impl LoginResponse {
    fn new(session: Session, user_id: Uuid, username: String) -> Self {
        Self {
            access_token: session.access_token,
            token_type: "Bearer",
            expires_in: session.expires_in,
            refresh_token: session.refresh_token,
            refresh_expires_in: session.refresh_expires_in,
            user_id,
            username,
        }
    }
}

fn user_agent(headers: &HeaderMap) -> Option<&str> {
    headers.get(USER_AGENT).and_then(|v| v.to_str().ok())
}

#[derive(Deserialize)]
struct Refresh {
    refresh_token: String,
}

/// Mounted regardless of `DEV_LOGIN`: every login path ends up here to renew.
async fn refresh(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<Refresh>,
) -> AppResult<Json<LoginResponse>> {
    let (user_id, session) =
        rotate_session(&state.pool, &state.config, &body.refresh_token, user_agent(&headers)).await?;
    let username = sqlx::query_scalar!(
        r#"select username::text as "username!" from users where id = $1 and deleted_at is null"#,
        user_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::Unauthorized)?;
    Ok(Json(LoginResponse::new(session, user_id, username)))
}

/// Creates the user on first use, then issues the same token a real login would.
async fn dev_login(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<DevLogin>,
) -> AppResult<Json<LoginResponse>> {
    let username = body.username.trim().to_lowercase();
    let display_name = body.display_name.unwrap_or_else(|| username.clone());
    let email = format!("{username}@dev.local");

    let user = sqlx::query!(
        r#"insert into users (email, username, display_name)
           values ($1, $2, $3)
           on conflict (username) do update set username = excluded.username
           returning id, username::text as "username!""#,
        email,
        username,
        display_name
    )
    .fetch_one(&state.pool)
    .await?;

    let session = issue_session(&state.pool, &state.config, user.id, None, user_agent(&headers)).await?;
    Ok(Json(LoginResponse::new(session, user.id, user.username)))
}
