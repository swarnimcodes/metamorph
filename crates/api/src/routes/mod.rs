mod auth;
mod body_weights;
mod exercises;
mod google;
mod stats;
mod gyms;
mod workouts;

use axum::{Json, Router, extract::State, routing::get};
use serde_json::{Value, json};
use tower_http::{cors::CorsLayer, trace::TraceLayer};

use crate::{AppState, error::AppResult};

pub fn router(state: AppState) -> Router {
    let mut app = Router::new()
        .route("/health", get(health))
        .merge(auth::routes())
        .merge(exercises::routes())
        .merge(gyms::routes())
        .merge(workouts::routes())
        .merge(stats::routes())
        .merge(body_weights::routes());

    if state.google.is_some() {
        app = app.merge(google::routes());
    }
    if state.config.dev_login {
        app = app.merge(auth::dev_routes());
    }
    if let Some(cors) = cors_layer(&state.config) {
        app = app.layer(cors);
    }

    app.layer(TraceLayer::new_for_http()).with_state(state)
}

async fn health(State(state): State<AppState>) -> AppResult<Json<Value>> {
    sqlx::query_scalar!("select 1 as \"ok!\"").fetch_one(&state.pool).await?;
    Ok(Json(json!({ "status": "ok" })))
}

/// Whether `name` is an IANA time zone the database knows. Anything stored and later used in
/// `at time zone` must pass this first, or every stats query for that user would fail.
pub(crate) async fn known_timezone(pool: &sqlx::PgPool, name: &str) -> AppResult<bool> {
    Ok(sqlx::query_scalar!(r#"select exists (select 1 from pg_timezone_names where name = $1) as "known!""#, name)
        .fetch_one(pool)
        .await?)
}

/// Browsers only call the API cross-origin from the configured origins. With none
/// configured, dev login mode stays permissive and production stays closed.
fn cors_layer(config: &crate::config::Config) -> Option<CorsLayer> {
    use axum::http::{HeaderName, HeaderValue, Method, header};
    if config.cors_origins.is_empty() {
        return config.dev_login.then(CorsLayer::permissive);
    }
    let origins: Vec<HeaderValue> = config.cors_origins.iter().filter_map(|o| o.parse().ok()).collect();
    Some(
        CorsLayer::new()
            .allow_origin(origins)
            .allow_methods([Method::GET, Method::POST, Method::PUT, Method::PATCH, Method::DELETE])
            .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE, HeaderName::from_static("accept")]),
    )
}
