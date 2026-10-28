//! Google sign-in. Mounted only when `GOOGLE_CLIENT_IDS` is configured.
//!
//! `POST /auth/google` verifies the ID token. A known Google account is logged in;
//! a new one gets a short-lived signup token and nothing is created, because every
//! account needs a username. `POST /auth/google/signup` then creates the user and
//! the linked identity together.

use axum::{
    Json, Router,
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
};
use rand::RngExt;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

use super::auth::{LoginResponse, user_agent};
use crate::{
    AppState,
    auth::{issue_session, issue_signup_token, verify_signup_token},
    error::{AppError, AppResult},
    extract::AppJson,
    google::{GoogleIdentity, VerifyError},
};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/auth/google", post(google_login))
        .route("/auth/google/signup", post(google_signup))
        .route("/auth/username-available", get(username_available))
}

/// Handles nobody should be able to claim.
const RESERVED: &[&str] = &[
    "about", "account", "admin", "administrator", "api", "app", "auth", "explore", "exercise", "exercises",
    "feed", "friends", "gym", "gyms", "help", "login", "logout", "me", "metamorph", "mod", "moderator",
    "null", "official", "privacy", "program", "programs", "register", "root", "search", "settings",
    "signin", "signup", "staff", "support", "system", "terms", "undefined", "user", "users", "workout",
    "workouts", "www",
];

#[derive(Debug, PartialEq, Eq)]
enum UsernameProblem {
    Invalid,
    Reserved,
}

/// Same rule as the `users_username_check` constraint, plus the reserved list.
fn check_username(username: &str) -> Result<(), UsernameProblem> {
    let well_formed = (3..=30).contains(&username.len())
        && username.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_');
    if !well_formed {
        Err(UsernameProblem::Invalid)
    } else if RESERVED.contains(&username) {
        Err(UsernameProblem::Reserved)
    } else {
        Ok(())
    }
}

fn normalize_username(raw: &str) -> String {
    raw.trim().to_lowercase()
}

async fn username_taken(pool: &PgPool, username: &str) -> AppResult<bool> {
    Ok(sqlx::query_scalar!(
        r#"select exists (select 1 from users where username = $1) as "taken!""#,
        username
    )
    .fetch_one(pool)
    .await?)
}

/// `rahul_sharma` from "Rahul Sharma", falling back to the email's local part.
fn base_username(identity: &GoogleIdentity) -> String {
    let slug = |text: &str| -> String {
        let mut out = String::new();
        for c in text.to_lowercase().chars() {
            if c.is_ascii_alphanumeric() {
                out.push(c);
            } else if !out.is_empty() && !out.ends_with('_') {
                out.push('_');
            }
        }
        out.trim_matches('_').chars().take(24).collect()
    };
    let from_name = slug(identity.name.as_deref().unwrap_or(""));
    let from_email = slug(identity.email.split('@').next().unwrap_or(""));
    [from_name, from_email].into_iter().find(|s| s.len() >= 3).unwrap_or_else(|| "lifter".into())
}

async fn suggest_username(pool: &PgPool, identity: &GoogleIdentity) -> AppResult<String> {
    let base = base_username(identity);
    for attempt in 0..12 {
        let candidate = if attempt == 0 {
            base.clone()
        } else {
            format!("{base}{}", rand::rng().random_range(10..10_000))
        };
        if check_username(&candidate).is_ok() && !username_taken(pool, &candidate).await? {
            return Ok(candidate);
        }
    }
    Ok(format!("{base}{}", &Uuid::now_v7().simple().to_string()[26..]))
}

#[derive(Deserialize)]
struct UsernameQuery {
    username: String,
}

#[derive(Serialize)]
struct UsernameAvailability {
    available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<&'static str>,
}

async fn username_available(
    State(state): State<AppState>,
    Query(query): Query<UsernameQuery>,
) -> AppResult<Json<UsernameAvailability>> {
    let username = normalize_username(&query.username);
    let unavailable = |reason| Json(UsernameAvailability { available: false, reason: Some(reason) });
    match check_username(&username) {
        Err(UsernameProblem::Invalid) => return Ok(unavailable("invalid")),
        Err(UsernameProblem::Reserved) => return Ok(unavailable("reserved")),
        Ok(()) => {}
    }
    if username_taken(&state.pool, &username).await? {
        return Ok(unavailable("taken"));
    }
    Ok(Json(UsernameAvailability { available: true, reason: None }))
}

#[derive(Deserialize)]
struct GoogleLogin {
    id_token: String,
}

#[derive(Serialize)]
struct LoggedIn {
    signup_required: bool,
    #[serde(flatten)]
    login: LoginResponse,
}

#[derive(Serialize)]
struct SignupRequired {
    signup_required: bool,
    signup_token: String,
    suggested_username: String,
    display_name: String,
    email: String,
    avatar_url: Option<String>,
}

#[derive(Serialize)]
#[serde(untagged)]
enum GoogleLoginResponse {
    LoggedIn(LoggedIn),
    SignupRequired(SignupRequired),
}

async fn google_login(
    State(state): State<AppState>,
    headers: HeaderMap,
    AppJson(body): AppJson<GoogleLogin>,
) -> AppResult<Json<GoogleLoginResponse>> {
    let verifier = state.google.as_ref().ok_or(AppError::NotFound)?;
    let identity = verifier.verify(&body.id_token).await.map_err(|e| match e {
        VerifyError::Invalid => AppError::Unauthorized,
        VerifyError::KeysUnavailable => {
            AppError::Upstream("could not verify the Google token right now, please try again".into())
        }
    })?;

    let existing = sqlx::query!(
        r#"update auth_identities ai set last_login_at = now()
             from users u
            where ai.provider = 'google' and ai.provider_subject = $1
              and u.id = ai.user_id and u.deleted_at is null
        returning u.id, u.username::text as "username!""#,
        identity.sub
    )
    .fetch_optional(&state.pool)
    .await?;

    if let Some(user) = existing {
        let session = issue_session(&state.pool, &state.config, user.id, None, user_agent(&headers)).await?;
        return Ok(Json(GoogleLoginResponse::LoggedIn(LoggedIn {
            signup_required: false,
            login: LoginResponse::new(session, user.id, user.username),
        })));
    }

    let suggested_username = suggest_username(&state.pool, &identity).await?;
    let display_name = identity.name.clone().filter(|n| !n.trim().is_empty()).unwrap_or_else(|| suggested_username.clone());
    Ok(Json(GoogleLoginResponse::SignupRequired(SignupRequired {
        signup_required: true,
        signup_token: issue_signup_token(&state.config, &identity)?,
        suggested_username,
        display_name,
        email: identity.email,
        avatar_url: identity.picture,
    })))
}

#[derive(Deserialize)]
struct GoogleSignup {
    signup_token: String,
    username: String,
    display_name: Option<String>,
}

fn conflict(code: &'static str, message: &str) -> AppError {
    AppError::coded(StatusCode::CONFLICT, code, message)
}

/// Maps the unique constraints a signup can trip to errors the UI can act on.
fn signup_error(err: sqlx::Error) -> AppError {
    let constraint = err.as_database_error().filter(|d| d.is_unique_violation()).and_then(|d| d.constraint());
    match constraint {
        Some("users_username_key") => conflict("username_taken", "that username is taken"),
        Some("users_email_key") => conflict("email_in_use", "an account with this email already exists"),
        Some("auth_identities_provider_provider_subject_key") => {
            conflict("identity_exists", "this Google account is already registered")
        }
        _ => err.into(),
    }
}

async fn google_signup(
    State(state): State<AppState>,
    headers: HeaderMap,
    AppJson(body): AppJson<GoogleSignup>,
) -> AppResult<Json<LoginResponse>> {
    state.google.as_ref().ok_or(AppError::NotFound)?;
    let identity = verify_signup_token(&state.config, &body.signup_token)?;

    let username = normalize_username(&body.username);
    match check_username(&username) {
        Err(UsernameProblem::Invalid) => {
            return Err(AppError::coded(
                StatusCode::BAD_REQUEST,
                "invalid_username",
                "usernames are 3-30 characters: lowercase letters, digits and underscores",
            ));
        }
        Err(UsernameProblem::Reserved) => {
            return Err(AppError::coded(StatusCode::BAD_REQUEST, "reserved_username", "that username is reserved"));
        }
        Ok(()) => {}
    }
    let display_name = body
        .display_name
        .map(|n| n.trim().to_string())
        .filter(|n| !n.is_empty())
        .or_else(|| identity.name.clone().filter(|n| !n.trim().is_empty()))
        .unwrap_or_else(|| username.clone());
    if display_name.chars().count() > 80 {
        return Err(AppError::BadRequest("display_name must be at most 80 characters".into()));
    }

    let mut tx = state.pool.begin().await?;

    // A replayed signup token must not create a second account.
    let already = sqlx::query_scalar!(
        r#"select exists (select 1 from auth_identities
                           where provider = 'google' and provider_subject = $1) as "found!""#,
        identity.sub
    )
    .fetch_one(&mut *tx)
    .await?;
    if already {
        return Err(conflict("identity_exists", "this Google account is already registered"));
    }

    let user_id = sqlx::query_scalar!(
        "insert into users (email, username, display_name, avatar_url)
         values ($1, $2, $3, $4) returning id",
        identity.email,
        username,
        display_name,
        identity.picture
    )
    .fetch_one(&mut *tx)
    .await
    .map_err(signup_error)?;

    sqlx::query!(
        "insert into auth_identities (user_id, provider, provider_subject, email_at_signup, last_login_at)
         values ($1, 'google', $2, $3, now())",
        user_id,
        identity.sub,
        identity.email
    )
    .execute(&mut *tx)
    .await
    .map_err(signup_error)?;

    tx.commit().await?;

    let session = issue_session(&state.pool, &state.config, user_id, None, user_agent(&headers)).await?;
    Ok(Json(LoginResponse::new(session, user_id, username)))
}
