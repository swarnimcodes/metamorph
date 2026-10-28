use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde_json::json;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("not found")]
    NotFound,
    #[error("unauthorized")]
    Unauthorized,
    #[error("{0}")]
    BadRequest(String),
    #[error("{0}")]
    Conflict(String),
    /// A 409 whose body carries extra top-level fields (e.g. `similar`) next to `error`.
    #[error("{message}")]
    ConflictWith { message: String, extra: serde_json::Value },
    /// An error the client can branch on: `{ "error": message, "code": code }`.
    #[error("{message}")]
    Coded { status: StatusCode, code: &'static str, message: String },
    /// A dependency we need (e.g. Google's signing keys) could not be reached: 502.
    #[error("{0}")]
    Upstream(String),
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

impl AppError {
    pub fn coded(status: StatusCode, code: &'static str, message: impl Into<String>) -> Self {
        AppError::Coded { status, code, message: message.into() }
    }
}

pub type AppResult<T> = Result<T, AppError>;

impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        if matches!(err, sqlx::Error::RowNotFound) {
            return AppError::NotFound;
        }
        if let Some(db) = err.as_database_error() {
            let constraint = db.constraint().unwrap_or("unknown");
            if db.is_unique_violation() {
                return AppError::Conflict(format!("already exists ({constraint})"));
            }
            if db.is_foreign_key_violation() {
                return AppError::BadRequest(format!("referenced record does not exist ({constraint})"));
            }
            if db.is_check_violation() {
                return AppError::BadRequest(format!("invalid value ({constraint})"));
            }
        }
        AppError::Internal(err.into())
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let status = match &self {
            AppError::NotFound => StatusCode::NOT_FOUND,
            AppError::Unauthorized => StatusCode::UNAUTHORIZED,
            AppError::BadRequest(_) => StatusCode::BAD_REQUEST,
            AppError::Conflict(_) | AppError::ConflictWith { .. } => StatusCode::CONFLICT,
            AppError::Coded { status, .. } => *status,
            AppError::Upstream(_) => StatusCode::BAD_GATEWAY,
            AppError::Internal(err) => {
                tracing::error!(error = ?err, "internal error");
                StatusCode::INTERNAL_SERVER_ERROR
            }
        };
        let message = match &self {
            AppError::Internal(_) => "internal server error".to_string(),
            other => other.to_string(),
        };
        let mut body = json!({ "error": message });
        if let AppError::Coded { code, .. } = &self {
            body["code"] = json!(code);
        }
        if let AppError::ConflictWith { extra: serde_json::Value::Object(extra), .. } = self {
            body.as_object_mut().expect("object literal").extend(extra);
        }
        (status, Json(body)).into_response()
    }
}
