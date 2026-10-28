//! Postgres enum mirrors shared by queries and JSON payloads.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "exercise_kind", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum ExerciseKind {
    WeightReps,
    BodyweightReps,
    Duration,
    Distance,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "exercise_status", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum ExerciseStatus {
    Official,
    User,
    PendingReview,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "tag_category", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum TagCategory {
    Equipment,
    Grip,
    Angle,
    Stance,
    Other,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "set_type", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum SetType {
    Working,
    Warmup,
    Drop,
    Failure,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "unit_system", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum UnitSystem {
    Metric,
    Imperial,
}
