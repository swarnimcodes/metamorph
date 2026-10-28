mod auth;
mod exercises;
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
        .merge(workouts::routes());

    if state.config.dev_login {
        app = app.merge(auth::dev_routes()).layer(CorsLayer::permissive());
    }

    app.layer(TraceLayer::new_for_http()).with_state(state)
}

async fn health(State(state): State<AppState>) -> AppResult<Json<Value>> {
    sqlx::query_scalar!("select 1 as \"ok!\"").fetch_one(&state.pool).await?;
    Ok(Json(json!({ "status": "ok" })))
}
