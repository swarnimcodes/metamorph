use std::sync::Arc;

use metamorph_api::{
    AppState,
    config::Config,
    google::{GOOGLE_JWKS_URL, GoogleVerifier},
    router,
};
use sqlx::postgres::PgPoolOptions;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "metamorph_api=debug,tower_http=info".into()),
        )
        .init();

    let config = Config::from_env()?;
    let database_url = std::env::var("DATABASE_URL")
        .map_err(|_| anyhow::anyhow!("DATABASE_URL must be set"))?;
    let pool = PgPoolOptions::new().max_connections(10).connect(&database_url).await?;

    if config.dev_login {
        tracing::warn!("DEV_LOGIN is enabled: POST /auth/dev-login issues tokens without credentials");
    }

    let google = (!config.google_client_ids.is_empty()).then(|| {
        Arc::new(GoogleVerifier::remote(config.google_client_ids.clone(), GOOGLE_JWKS_URL.into()))
    });
    tracing::info!("Google sign-in {}", if google.is_some() { "enabled" } else { "disabled (GOOGLE_CLIENT_IDS unset)" });

    let addr = config.bind_addr;
    let app = router(AppState { pool, config: Arc::new(config), google });
    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!("listening on {addr}");
    axum::serve(listener, app).await?;
    Ok(())
}
