use axum::{
    extract::FromRequestParts,
    http::{header::AUTHORIZATION, request::Parts},
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, Validation, decode, encode};
use rand::Rng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{AppState, config::Config, error::AppError};

#[derive(Debug, Serialize, Deserialize)]
struct Claims {
    sub: Uuid,
    exp: u64,
}

/// Issues the access token every login path (dev now, OAuth later) hands out.
pub fn issue_access_token(config: &Config, user_id: Uuid) -> Result<String, AppError> {
    let exp = (time::OffsetDateTime::now_utc().unix_timestamp() as u64) + config.access_token_ttl_secs;
    let claims = Claims { sub: user_id, exp };
    encode(
        &Header::new(Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(config.jwt_secret.as_bytes()),
    )
    .map_err(|e| AppError::Internal(e.into()))
}

pub const REFRESH_TOKEN_TTL_SECS: u64 = 30 * 24 * 60 * 60;

/// An access token plus the refresh token that renews it.
#[derive(Debug)]
pub struct Session {
    pub access_token: String,
    pub expires_in: u64,
    pub refresh_token: String,
    pub refresh_expires_in: u64,
}

fn hash_refresh_token(token: &str) -> Vec<u8> {
    Sha256::digest(token.as_bytes()).to_vec()
}

/// Issues a session for a user whose identity is already established (dev login,
/// future OAuth callback). Pass `family_id` only when rotating an existing token;
/// a fresh login starts a new family. Only the SHA-256 of the refresh token is stored.
pub async fn issue_session(
    pool: &PgPool,
    config: &Config,
    user_id: Uuid,
    family_id: Option<Uuid>,
    user_agent: Option<&str>,
) -> Result<Session, AppError> {
    let mut bytes = [0u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    let refresh_token = URL_SAFE_NO_PAD.encode(bytes);

    sqlx::query!(
        "insert into refresh_tokens (user_id, token_hash, family_id, user_agent, expires_at)
         values ($1, $2, $3, $4, now() + make_interval(secs => $5))",
        user_id,
        hash_refresh_token(&refresh_token),
        family_id.unwrap_or_else(Uuid::now_v7),
        user_agent,
        REFRESH_TOKEN_TTL_SECS as f64
    )
    .execute(pool)
    .await?;

    Ok(Session {
        access_token: issue_access_token(config, user_id)?,
        expires_in: config.access_token_ttl_secs,
        refresh_token,
        refresh_expires_in: REFRESH_TOKEN_TTL_SECS,
    })
}

/// Rotates a refresh token: revokes the presented one and issues a new session in
/// the same family. Presenting an already-revoked token means it leaked (or was
/// replayed), so the whole family is revoked. Returns the user id with the session.
pub async fn rotate_session(
    pool: &PgPool,
    config: &Config,
    refresh_token: &str,
    user_agent: Option<&str>,
) -> Result<(Uuid, Session), AppError> {
    let hash = hash_refresh_token(refresh_token);

    // The conditional update makes concurrent use of one token race-safe: only one caller wins.
    let used = sqlx::query!(
        "update refresh_tokens set revoked_at = now()
          where token_hash = $1 and revoked_at is null and expires_at > now()
          returning user_id, family_id",
        hash
    )
    .fetch_optional(pool)
    .await?;

    let Some(used) = used else {
        sqlx::query!(
            "update refresh_tokens set revoked_at = now()
              where revoked_at is null
                and family_id = (select family_id from refresh_tokens
                                  where token_hash = $1 and revoked_at is not null)",
            hash
        )
        .execute(pool)
        .await?;
        return Err(AppError::Unauthorized);
    };

    let session = issue_session(pool, config, used.user_id, Some(used.family_id), user_agent).await?;
    Ok((used.user_id, session))
}

/// The authenticated caller. Add it to a handler's arguments to require login.
#[derive(Debug, Clone, Copy)]
pub struct AuthUser(pub Uuid);

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, AppError> {
        let token = parts
            .headers
            .get(AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .ok_or(AppError::Unauthorized)?;
        let data = decode::<Claims>(
            token,
            &DecodingKey::from_secret(state.config.jwt_secret.as_bytes()),
            &Validation::new(Algorithm::HS256),
        )
        .map_err(|_| AppError::Unauthorized)?;
        Ok(AuthUser(data.claims.sub))
    }
}
