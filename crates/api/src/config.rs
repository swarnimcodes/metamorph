use std::net::SocketAddr;

#[derive(Debug, Clone)]
pub struct Config {
    pub jwt_secret: String,
    pub access_token_ttl_secs: u64,
    /// Mounts `POST /auth/dev-login`. Must stay off in production.
    pub dev_login: bool,
    pub bind_addr: SocketAddr,
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
        })
    }
}
