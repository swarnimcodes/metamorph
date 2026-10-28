//! Google sign-in: the ID-token verifier and the login/signup endpoints.
//! Tokens are signed with throwaway keys from `tests/fixtures`; nothing here
//! touches the network or a real Google account.

use std::sync::Arc;

use axum::{
    Router,
    body::Body,
    http::{Method, Request, StatusCode, header},
};
use http_body_util::BodyExt;
use jsonwebtoken::{Algorithm, EncodingKey, Header, jwk::JwkSet};
use metamorph_api::{
    AppState,
    config::Config,
    google::{GoogleVerifier, VerifyError},
    router,
};
use serde_json::{Value, json};
use sqlx::PgPool;
use tower::ServiceExt;

const CLIENT_ID: &str = "web-client.apps.googleusercontent.com";
const OTHER_CLIENT_ID: &str = "android-client.apps.googleusercontent.com";
const KID: &str = "test-key-1";

/// An RSA key pair generated when the tests run, so no private key is committed.
struct TestKey {
    pem: String,
    n: String,
    e: String,
}

fn generate_key() -> TestKey {
    use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD as B64};
    use rsa::{
        RsaPrivateKey,
        pkcs8::{EncodePrivateKey, LineEnding},
        traits::PublicKeyParts,
    };
    let key = RsaPrivateKey::new(&mut rand_core::OsRng, 2048).expect("generate RSA test key");
    TestKey {
        pem: key.to_pkcs8_pem(LineEnding::LF).expect("encode test key").to_string(),
        n: B64.encode(key.n().to_bytes_be()),
        e: B64.encode(key.e().to_bytes_be()),
    }
}

/// `trusted()` is in the verifier's key set; `untrusted()` is a different key that is not.
fn keys() -> &'static (TestKey, TestKey) {
    static KEYS: std::sync::OnceLock<(TestKey, TestKey)> = std::sync::OnceLock::new();
    KEYS.get_or_init(|| (generate_key(), generate_key()))
}
fn trusted() -> &'static TestKey {
    &keys().0
}
fn untrusted() -> &'static TestKey {
    &keys().1
}

fn now() -> i64 {
    time::OffsetDateTime::now_utc().unix_timestamp()
}

fn trusted_keys() -> JwkSet {
    let key = trusted();
    serde_json::from_value(json!({
        "keys": [{ "kty": "RSA", "alg": "RS256", "use": "sig", "kid": KID, "n": key.n, "e": key.e }]
    }))
    .unwrap()
}

fn verifier() -> GoogleVerifier {
    GoogleVerifier::with_static_keys(vec![CLIENT_ID.into(), OTHER_CLIENT_ID.into()], trusted_keys())
}

/// A well-formed Google claim set that each test then tweaks.
fn claims(sub: &str, email: &str) -> Value {
    json!({
        "iss": "https://accounts.google.com",
        "aud": CLIENT_ID,
        "sub": sub,
        "email": email,
        "email_verified": true,
        "name": "Rahul Sharma",
        "picture": "https://example.com/p.png",
        "iat": now(),
        "exp": now() + 3600,
    })
}

fn sign_with(pem: &str, kid: &str, alg: Algorithm, claims: &Value) -> String {
    let mut header = Header::new(alg);
    header.kid = Some(kid.into());
    let key = match alg {
        Algorithm::RS256 => EncodingKey::from_rsa_pem(pem.as_bytes()).unwrap(),
        _ => EncodingKey::from_secret(pem.as_bytes()),
    };
    jsonwebtoken::encode(&header, claims, &key).unwrap()
}

fn sign(claims: &Value) -> String {
    sign_with(&trusted().pem, KID, Algorithm::RS256, claims)
}

// ---- verifier ----

#[tokio::test]
async fn verifier_accepts_a_good_token() {
    let id = verifier().verify(&sign(&claims("g-1", "rahul@example.com"))).await.unwrap();
    assert_eq!(id.sub, "g-1");
    assert_eq!(id.email, "rahul@example.com");
    assert_eq!(id.name.as_deref(), Some("Rahul Sharma"));
}

#[tokio::test]
async fn verifier_accepts_either_google_issuer_and_any_configured_client() {
    let v = verifier();
    let mut c = claims("g-1", "a@example.com");
    c["iss"] = json!("accounts.google.com");
    assert!(v.verify(&sign(&c)).await.is_ok());
    c["aud"] = json!(OTHER_CLIENT_ID);
    assert!(v.verify(&sign(&c)).await.is_ok());
}

#[tokio::test]
async fn verifier_rejects_every_kind_of_bad_token() {
    let v = verifier();
    let base = claims("g-1", "a@example.com");
    let bad = |edit: &dyn Fn(&mut Value)| {
        let mut c = base.clone();
        edit(&mut c);
        sign(&c)
    };
    let cases: Vec<(&str, String)> = vec![
        ("wrong audience", bad(&|c| c["aud"] = json!("someone-elses-client"))),
        ("wrong issuer", bad(&|c| c["iss"] = json!("https://evil.example.com"))),
        ("expired", bad(&|c| c["exp"] = json!(now() - 3600))),
        ("email not verified", bad(&|c| c["email_verified"] = json!(false))),
        ("email_verified missing", bad(&|c| { c.as_object_mut().unwrap().remove("email_verified"); })),
        ("email missing", bad(&|c| { c.as_object_mut().unwrap().remove("email"); })),
        ("empty sub", bad(&|c| c["sub"] = json!(""))),
        ("signed by an untrusted key", sign_with(&untrusted().pem, KID, Algorithm::RS256, &base)),
        ("unknown kid", sign_with(&trusted().pem, "rotated-away", Algorithm::RS256, &base)),
        ("HS256 token", sign_with("any-shared-secret", KID, Algorithm::HS256, &base)),
        ("garbage", "not.a.jwt".to_string()),
        ("empty", String::new()),
    ];
    for (name, token) in cases {
        match v.verify(&token).await {
            Err(VerifyError::Invalid) => {}
            other => panic!("{name}: expected Invalid, got {other:?}"),
        }
    }
}

#[tokio::test]
async fn verifier_without_a_kid_or_with_alg_none_is_rejected() {
    use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD as B64};
    let v = verifier();
    let payload = B64.encode(claims("g-1", "a@example.com").to_string());
    for header in [json!({ "alg": "none", "typ": "JWT" }), json!({ "alg": "RS256", "typ": "JWT" })] {
        let token = format!("{}.{payload}.", B64.encode(header.to_string()));
        assert!(matches!(v.verify(&token).await, Err(VerifyError::Invalid)), "{header}");
    }
}

// ---- endpoints ----

fn test_config(cors_origins: Vec<String>) -> Config {
    Config {
        jwt_secret: "test-secret".into(),
        access_token_ttl_secs: 3600,
        dev_login: false,
        bind_addr: "127.0.0.1:0".parse().unwrap(),
        google_client_ids: vec![CLIENT_ID.into()],
        cors_origins,
    }
}

fn app(pool: PgPool) -> Router {
    router(AppState { pool, config: Arc::new(test_config(vec![])), google: Some(Arc::new(verifier())) })
}

async fn call(app: &Router, method: Method, uri: &str, token: Option<&str>, body: Option<Value>) -> (StatusCode, Value) {
    let mut req = Request::builder().method(method).uri(uri);
    if let Some(t) = token {
        req = req.header(header::AUTHORIZATION, format!("Bearer {t}"));
    }
    let body = match body {
        Some(v) => {
            req = req.header(header::CONTENT_TYPE, "application/json");
            Body::from(v.to_string())
        }
        None => Body::empty(),
    };
    let resp = app.clone().oneshot(req.body(body).unwrap()).await.unwrap();
    let status = resp.status();
    let bytes = resp.into_body().collect().await.unwrap().to_bytes();
    (status, if bytes.is_empty() { Value::Null } else { serde_json::from_slice(&bytes).unwrap_or(Value::Null) })
}

async fn google_login(app: &Router, token: &str) -> (StatusCode, Value) {
    call(app, Method::POST, "/auth/google", None, Some(json!({ "id_token": token }))).await
}

async fn signup(app: &Router, signup_token: &str, username: &str) -> (StatusCode, Value) {
    call(
        app,
        Method::POST,
        "/auth/google/signup",
        None,
        Some(json!({ "signup_token": signup_token, "username": username })),
    )
    .await
}

/// Runs `/auth/google` for a brand-new identity and returns its signup token.
async fn begin_signup(app: &Router, sub: &str, email: &str) -> Value {
    let (status, body) = google_login(app, &sign(&claims(sub, email))).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["signup_required"], true, "{body}");
    body
}

async fn user_count(pool: &PgPool) -> i64 {
    sqlx::query_scalar("select count(*) from users").fetch_one(pool).await.unwrap()
}

#[sqlx::test(migrations = "../../migrations")]
async fn new_google_user_signs_up_then_logs_straight_in(pool: PgPool) {
    let app = app(pool.clone());
    let start = begin_signup(&app, "g-100", "rahul.sharma@example.com").await;
    assert_eq!(start["suggested_username"], "rahul_sharma");
    assert_eq!(start["display_name"], "Rahul Sharma");
    assert_eq!(start["email"], "rahul.sharma@example.com");
    assert_eq!(start["avatar_url"], "https://example.com/p.png");
    assert_eq!(user_count(&pool).await, 0, "nothing may be created before a username is chosen");

    let (status, avail) =
        call(&app, Method::GET, "/auth/username-available?username=rahul_sharma", None, None).await;
    assert_eq!((status, &avail["available"]), (StatusCode::OK, &json!(true)));

    let (status, login) = signup(&app, start["signup_token"].as_str().unwrap(), "  Rahul_S  ").await;
    assert_eq!(status, StatusCode::OK, "{login}");
    assert_eq!(login["username"], "rahul_s", "usernames are trimmed and lowercased");
    for field in ["access_token", "refresh_token", "user_id", "expires_in", "refresh_expires_in"] {
        assert!(!login[field].is_null(), "{field} missing from {login}");
    }

    let (status, me) = call(&app, Method::GET, "/me", Some(login["access_token"].as_str().unwrap()), None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(me["username"], "rahul_s");
    assert_eq!(me["email"], "rahul.sharma@example.com");
    assert_eq!(me["display_name"], "Rahul Sharma");
    assert_eq!(me["avatar_url"], "https://example.com/p.png");

    let linked: (String, String) =
        sqlx::query_as("select provider::text, provider_subject from auth_identities").fetch_one(&pool).await.unwrap();
    assert_eq!(linked, ("google".into(), "g-100".into()));

    // The next sign-in is a plain login for the same user.
    let (status, again) = google_login(&app, &sign(&claims("g-100", "rahul.sharma@example.com"))).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(again["signup_required"], false);
    assert_eq!(again["user_id"], login["user_id"]);
    assert_eq!(user_count(&pool).await, 1);

    // ...and its refresh token works through the shared refresh endpoint.
    let (status, refreshed) = call(
        &app,
        Method::POST,
        "/auth/refresh",
        None,
        Some(json!({ "refresh_token": again["refresh_token"] })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{refreshed}");
}

#[sqlx::test(migrations = "../../migrations")]
async fn username_rules_are_enforced_with_actionable_codes(pool: PgPool) {
    let app = app(pool.clone());
    let first = begin_signup(&app, "g-1", "one@example.com").await;
    let (status, _) = signup(&app, first["signup_token"].as_str().unwrap(), "taken_name").await;
    assert_eq!(status, StatusCode::OK);

    let second = begin_signup(&app, "g-2", "two@example.com").await;
    let token = second["signup_token"].as_str().unwrap();
    for (name, status, code) in [
        ("Taken_Name", StatusCode::CONFLICT, "username_taken"), // case-insensitive
        ("admin", StatusCode::BAD_REQUEST, "reserved_username"),
        ("ab", StatusCode::BAD_REQUEST, "invalid_username"),
        ("has space", StatusCode::BAD_REQUEST, "invalid_username"),
        ("dash-ed", StatusCode::BAD_REQUEST, "invalid_username"),
        ("ünïcode", StatusCode::BAD_REQUEST, "invalid_username"),
        (&"x".repeat(31), StatusCode::BAD_REQUEST, "invalid_username"),
    ] {
        let (got, body) = signup(&app, token, name).await;
        assert_eq!((got, body["code"].as_str()), (status, Some(code)), "{name}: {body}");
    }
    assert_eq!(user_count(&pool).await, 1, "failed signups must not leave users behind");

    for (name, reason) in [("taken_name", "taken"), ("TAKEN_NAME", "taken"), ("admin", "reserved"), ("a", "invalid"), ("no spaces", "invalid")] {
        let (_, body) =
            call(&app, Method::GET, &format!("/auth/username-available?username={}", name.replace(' ', "%20")), None, None).await;
        assert_eq!((&body["available"], body["reason"].as_str()), (&json!(false), Some(reason)), "{name}");
    }

    // The same signup token still works once the name is fixed.
    let (status, _) = signup(&app, token, "fresh_name").await;
    assert_eq!(status, StatusCode::OK);
}

#[sqlx::test(migrations = "../../migrations")]
async fn suggested_username_avoids_taken_and_reserved_names(pool: PgPool) {
    let app = app(pool.clone());
    let first = begin_signup(&app, "g-1", "rahul.sharma@example.com").await;
    signup(&app, first["signup_token"].as_str().unwrap(), "rahul_sharma").await;

    let second = begin_signup(&app, "g-2", "other@example.com").await;
    let suggestion = second["suggested_username"].as_str().unwrap();
    assert_ne!(suggestion, "rahul_sharma");
    assert!(suggestion.starts_with("rahul_sharma"), "{suggestion}");
    let (_, avail) = call(&app, Method::GET, &format!("/auth/username-available?username={suggestion}"), None, None).await;
    assert_eq!(avail["available"], true, "the suggestion must itself be available");

    // No name and a reserved email local part still produce a valid suggestion.
    let mut c = claims("g-3", "admin@example.com");
    c["name"] = json!("");
    let (_, third) = google_login(&app, &sign(&c)).await;
    let suggestion = third["suggested_username"].as_str().unwrap();
    assert!(suggestion.starts_with("admin") && suggestion != "admin", "{suggestion}");
    assert_eq!(third["display_name"], suggestion);
}

#[sqlx::test(migrations = "../../migrations")]
async fn an_existing_email_is_never_auto_linked(pool: PgPool) {
    let app = app(pool.clone());
    let first = begin_signup(&app, "g-1", "same@example.com").await;
    signup(&app, first["signup_token"].as_str().unwrap(), "first_user").await;

    // A different Google account (new sub) that reports the same email.
    let second = begin_signup(&app, "g-2", "same@example.com").await;
    let (status, body) = signup(&app, second["signup_token"].as_str().unwrap(), "second_user").await;
    assert_eq!((status, body["code"].as_str()), (StatusCode::CONFLICT, Some("email_in_use")), "{body}");
    assert_eq!(user_count(&pool).await, 1);
    let identities: i64 = sqlx::query_scalar("select count(*) from auth_identities").fetch_one(&pool).await.unwrap();
    assert_eq!(identities, 1, "the failed signup must roll back its identity too");
}

#[sqlx::test(migrations = "../../migrations")]
async fn a_signup_token_cannot_be_replayed(pool: PgPool) {
    let app = app(pool.clone());
    let start = begin_signup(&app, "g-1", "one@example.com").await;
    let token = start["signup_token"].as_str().unwrap();
    assert_eq!(signup(&app, token, "first_try").await.0, StatusCode::OK);

    let (status, body) = signup(&app, token, "second_try").await;
    assert_eq!((status, body["code"].as_str()), (StatusCode::CONFLICT, Some("identity_exists")), "{body}");
    assert_eq!(user_count(&pool).await, 1);
}

#[sqlx::test(migrations = "../../migrations")]
async fn signup_and_access_tokens_are_not_interchangeable(pool: PgPool) {
    let app = app(pool.clone());
    let start = begin_signup(&app, "g-1", "one@example.com").await;
    let signup_token = start["signup_token"].as_str().unwrap();

    // A signup token is not a session.
    let (status, _) = call(&app, Method::GET, "/me", Some(signup_token), None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    let (status, _) = call(&app, Method::GET, "/workouts", Some(signup_token), None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    // An access token is not a signup token.
    let (_, login) = signup(&app, signup_token, "legit_user").await;
    let access = login["access_token"].as_str().unwrap();
    let (status, _) = signup(&app, access, "sneaky_user").await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    let (status, _) = signup(&app, "garbage", "sneaky_user").await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(user_count(&pool).await, 1);

    // A Google ID token is neither.
    let (status, _) = call(&app, Method::GET, "/me", Some(&sign(&claims("g-1", "one@example.com"))), None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[sqlx::test(migrations = "../../migrations")]
async fn bad_google_tokens_are_401_and_create_nothing(pool: PgPool) {
    let app = app(pool.clone());
    let mut wrong_aud = claims("g-1", "one@example.com");
    wrong_aud["aud"] = json!("another-app");
    for token in [sign(&wrong_aud), sign_with(&untrusted().pem, KID, Algorithm::RS256, &claims("g-1", "one@example.com")), "junk".into()] {
        let (status, _) = google_login(&app, &token).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
    }
    let (status, body) = call(&app, Method::POST, "/auth/google", None, Some(json!({ "id_token": 5 }))).await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
    assert_eq!(user_count(&pool).await, 0);
}

#[sqlx::test(migrations = "../../migrations")]
async fn google_routes_are_absent_when_not_configured(pool: PgPool) {
    let app = router(AppState {
        pool,
        config: Arc::new(Config { google_client_ids: vec![], ..test_config(vec![]) }),
        google: None,
    });
    for (method, uri) in [
        (Method::POST, "/auth/google"),
        (Method::POST, "/auth/google/signup"),
        (Method::GET, "/auth/username-available?username=abc"),
    ] {
        let (status, _) = call(&app, method, uri, None, Some(json!({}))).await;
        assert_eq!(status, StatusCode::NOT_FOUND, "{uri}");
    }
}

#[sqlx::test(migrations = "../../migrations")]
async fn cors_allows_only_configured_origins_without_dev_login(pool: PgPool) {
    let app = router(AppState {
        pool,
        config: Arc::new(test_config(vec!["http://localhost:1420".into()])),
        google: Some(Arc::new(verifier())),
    });
    let preflight = |origin: &'static str| {
        let app = app.clone();
        async move {
            let req = Request::builder()
                .method(Method::OPTIONS)
                .uri("/auth/google")
                .header(header::ORIGIN, origin)
                .header(header::ACCESS_CONTROL_REQUEST_METHOD, "POST")
                .header(header::ACCESS_CONTROL_REQUEST_HEADERS, "content-type")
                .body(Body::empty())
                .unwrap();
            app.oneshot(req).await.unwrap()
        }
    };
    let allowed = preflight("http://localhost:1420").await;
    assert_eq!(allowed.headers().get(header::ACCESS_CONTROL_ALLOW_ORIGIN).unwrap(), "http://localhost:1420");
    let denied = preflight("http://evil.example.com").await;
    assert!(denied.headers().get(header::ACCESS_CONTROL_ALLOW_ORIGIN).is_none());
}

/// The `typ` claim is what keeps the token kinds apart even when the rest of a
/// forged token would parse: same secret, a valid user id as `sub`, only `typ` differs.
#[sqlx::test(migrations = "../../migrations")]
async fn the_typ_claim_alone_separates_token_kinds(pool: PgPool) {
    let app = app(pool.clone());
    let start = begin_signup(&app, "g-1", "one@example.com").await;
    let (_, login) = signup(&app, start["signup_token"].as_str().unwrap(), "typ_user").await;
    let user_id = login["user_id"].as_str().unwrap();

    let forge = |typ: &str| {
        let claims = json!({ "typ": typ, "sub": user_id, "exp": now() + 3600 });
        jsonwebtoken::encode(&Header::new(Algorithm::HS256), &claims, &EncodingKey::from_secret(b"test-secret")).unwrap()
    };
    let (status, _) = call(&app, Method::GET, "/me", Some(&forge("access")), None).await;
    assert_eq!(status, StatusCode::OK, "control: a correctly typed token with a valid sub is accepted");
    for typ in ["signup", "refresh", ""] {
        let (status, _) = call(&app, Method::GET, "/me", Some(&forge(typ)), None).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED, "typ={typ:?} must not work as an access token");
    }
}
