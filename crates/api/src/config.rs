use std::net::SocketAddr;

#[derive(Debug, Clone)]
pub struct Config {
    pub jwt_secret: String,
    pub access_token_ttl_secs: u64,
    /// Mounts `POST /auth/dev-login`. Must stay off in production.
    pub dev_login: bool,
    pub bind_addr: SocketAddr,
    /// Google OAuth client ids whose ID tokens we accept (web, later Android).
    /// Empty disables the Google sign-in routes.
    pub google_client_ids: Vec<String>,
    /// Origins allowed to call the API from a browser, independent of `dev_login`.
    pub cors_origins: Vec<String>,
}

fn list(var: &str) -> Vec<String> {
    std::env::var(var)
        .unwrap_or_default()
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
        .collect()
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        Ok(Self {
            jwt_secret: std::env::var("JWT_SECRET")
                .map_err(|_| anyhow::anyhow!("JWT_SECRET must be set"))?,
            access_token_ttl_secs: std::env::var("ACCESS_TOKEN_TTL_SECS")
                .ok()
                .map(|v| v.parse())
                .transpose()?
                .unwrap_or(3600),
            dev_login: std::env::var("DEV_LOGIN").is_ok_and(|v| v == "true" || v == "1"),
            bind_addr: std::env::var("BIND_ADDR")
                .unwrap_or_else(|_| "127.0.0.1:3000".into())
                .parse()?,
            google_client_ids: list("GOOGLE_CLIENT_IDS"),
            cors_origins: list("CORS_ORIGINS"),
        })
    }
}
