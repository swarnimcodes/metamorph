//! Verifies Google ID tokens (the `credential` the "Sign in with Google" button
//! hands the browser, or the token a native Android client obtains).
//!
//! Only RS256 tokens signed by a key in Google's published key set are accepted,
//! issued by Google, for one of our client ids, unexpired, with a verified email.
//! Accounts are keyed on the stable `sub`, never on the email.

use std::time::{Duration, Instant};

use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode, decode_header, jwk::JwkSet};
use serde::Deserialize;
use tokio::sync::RwLock;

pub const GOOGLE_JWKS_URL: &str = "https://www.googleapis.com/oauth2/v3/certs";

const ISSUERS: [&str; 2] = ["https://accounts.google.com", "accounts.google.com"];
const CLOCK_SKEW_LEEWAY_SECS: u64 = 60;
/// An unknown `kid` triggers at most one key refetch per this interval, so a
/// stream of junk tokens cannot make us hammer Google.
const MIN_REFETCH_INTERVAL: Duration = Duration::from_secs(30);
const DEFAULT_KEY_TTL: Duration = Duration::from_secs(3600);

#[derive(Debug, thiserror::Error)]
pub enum VerifyError {
    /// The token is not acceptable: bad signature, audience, issuer, expiry, ...
    #[error("invalid Google token")]
    Invalid,
    /// We could not obtain Google's signing keys. Not the caller's fault.
    #[error("could not fetch Google's signing keys")]
    KeysUnavailable,
}

#[derive(Debug, Clone)]
pub struct GoogleIdentity {
    pub sub: String,
    pub email: String,
    pub name: Option<String>,
    pub picture: Option<String>,
}

#[derive(Deserialize)]
struct GoogleClaims {
    sub: String,
    email: Option<String>,
    email_verified: Option<bool>,
    name: Option<String>,
    picture: Option<String>,
}

enum KeySource {
    Remote { url: String, client: reqwest::Client },
    /// Fixed keys, for tests: never refetched, so nothing touches the network.
    Static,
}

struct CachedKeys {
    set: JwkSet,
    fetched_at: Instant,
    expires_at: Instant,
}

pub struct GoogleVerifier {
    client_ids: Vec<String>,
    source: KeySource,
    cache: RwLock<Option<CachedKeys>>,
}

impl GoogleVerifier {
    pub fn remote(client_ids: Vec<String>, jwks_url: String) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .expect("reqwest client with default TLS config");
        Self { client_ids, source: KeySource::Remote { url: jwks_url, client }, cache: RwLock::new(None) }
    }

    pub fn with_static_keys(client_ids: Vec<String>, keys: JwkSet) -> Self {
        let now = Instant::now();
        let cached = CachedKeys { set: keys, fetched_at: now, expires_at: now + Duration::from_secs(10 * 365 * 86_400) };
        Self { client_ids, source: KeySource::Static, cache: RwLock::new(Some(cached)) }
    }

    async fn fetch(&self) -> Result<CachedKeys, VerifyError> {
        let KeySource::Remote { url, client } = &self.source else {
            return Err(VerifyError::KeysUnavailable);
        };
        let unavailable = |err: &dyn std::fmt::Display| {
            tracing::warn!(error = %err, "fetching Google signing keys failed");
            VerifyError::KeysUnavailable
        };
        let resp = client
            .get(url)
            .send()
            .await
            .and_then(|r| r.error_for_status())
            .map_err(|e| unavailable(&e))?;
        let ttl = resp
            .headers()
            .get(reqwest::header::CACHE_CONTROL)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.split(',').find_map(|d| d.trim().strip_prefix("max-age=")?.parse::<u64>().ok()))
            .map(|secs| Duration::from_secs(secs.clamp(60, 86_400)))
            .unwrap_or(DEFAULT_KEY_TTL);
        let set: JwkSet = resp.json().await.map_err(|e| unavailable(&e))?;
        let now = Instant::now();
        Ok(CachedKeys { set, fetched_at: now, expires_at: now + ttl })
    }

    /// The decoding key for `kid`, refetching Google's key set when it has expired
    /// or Google may have rotated (an unknown kid, rate limited).
    async fn key_for(&self, kid: &str) -> Result<DecodingKey, VerifyError> {
        {
            let cache = self.cache.read().await;
            if let Some(c) = cache.as_ref()
                && c.expires_at > Instant::now()
                && let Some(jwk) = c.set.find(kid)
            {
                return DecodingKey::from_jwk(jwk).map_err(|_| VerifyError::Invalid);
            }
        }

        // Holding the write lock across the fetch makes concurrent misses share one request.
        let mut cache = self.cache.write().await;
        let now = Instant::now();
        let stale = match cache.as_ref() {
            None => true,
            Some(c) => {
                c.expires_at <= now
                    || (c.set.find(kid).is_none() && now.duration_since(c.fetched_at) >= MIN_REFETCH_INTERVAL)
            }
        };
        if stale && matches!(self.source, KeySource::Remote { .. }) {
            *cache = Some(self.fetch().await?);
        }
        let jwk = cache.as_ref().and_then(|c| c.set.find(kid)).ok_or(VerifyError::Invalid)?;
        DecodingKey::from_jwk(jwk).map_err(|_| VerifyError::Invalid)
    }

    pub async fn verify(&self, id_token: &str) -> Result<GoogleIdentity, VerifyError> {
        let header = decode_header(id_token).map_err(|_| VerifyError::Invalid)?;
        if header.alg != Algorithm::RS256 {
            return Err(VerifyError::Invalid);
        }
        let kid = header.kid.ok_or(VerifyError::Invalid)?;
        let key = self.key_for(&kid).await?;

        // `Validation::new` pins the accepted algorithms to exactly [RS256].
        let mut validation = Validation::new(Algorithm::RS256);
        validation.set_audience(&self.client_ids);
        validation.set_issuer(&ISSUERS);
        validation.set_required_spec_claims(&["exp", "iss", "aud", "sub"]);
        validation.leeway = CLOCK_SKEW_LEEWAY_SECS;

        let claims = decode::<GoogleClaims>(id_token, &key, &validation)
            .map_err(|e| {
                tracing::debug!(error = %e, "Google ID token rejected");
                VerifyError::Invalid
            })?
            .claims;

        match (claims.email, claims.email_verified) {
            (Some(email), Some(true)) if !claims.sub.is_empty() => {
                Ok(GoogleIdentity { sub: claims.sub, email, name: claims.name, picture: claims.picture })
            }
            _ => Err(VerifyError::Invalid),
        }
    }
}
