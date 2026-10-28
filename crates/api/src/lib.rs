pub mod auth;
pub mod config;
pub mod error;
pub mod extract;
pub mod google;
pub mod models;
pub mod routes;

use std::sync::Arc;

use sqlx::PgPool;

use crate::{config::Config, google::GoogleVerifier};

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub config: Arc<Config>,
    /// Present only when Google sign-in is configured.
    pub google: Option<Arc<GoogleVerifier>>,
}

pub use routes::router;
