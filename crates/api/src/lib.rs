pub mod auth;
pub mod config;
pub mod error;
pub mod extract;
pub mod models;
pub mod routes;

use std::sync::Arc;

use sqlx::PgPool;

use crate::config::Config;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub config: Arc<Config>,
}

pub use routes::router;
