use axum::{Json, Router, extract::State, routing::{get, post}};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    AppState,
    auth::{AuthUser, issue_access_token},
    error::{AppError, AppResult},
    models::UnitSystem,
};

pub fn routes() -> Router<AppState> {
    Router::new().route("/me", get(me))
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
    user_id: Uuid,
    username: String,
}

/// Creates the user on first use, then issues the same token a real login would.
async fn dev_login(
    State(state): State<AppState>,
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

    Ok(Json(LoginResponse {
        access_token: issue_access_token(&state.config, user.id)?,
        token_type: "Bearer",
        expires_in: state.config.access_token_ttl_secs,
        user_id: user.id,
        username: user.username,
    }))
}
