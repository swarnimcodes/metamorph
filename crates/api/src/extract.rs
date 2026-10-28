use axum::extract::{FromRequest, rejection::JsonRejection};

use crate::error::AppError;

/// `Json` for request bodies, but a malformed or mistyped body is rejected with
/// the API's usual `{ "error": ... }` shape (400) instead of axum's plain text.
#[derive(FromRequest)]
#[from_request(via(axum::Json), rejection(AppError))]
pub struct AppJson<T>(pub T);

impl From<JsonRejection> for AppError {
    fn from(rejection: JsonRejection) -> Self {
        AppError::BadRequest(rejection.body_text())
    }
}
