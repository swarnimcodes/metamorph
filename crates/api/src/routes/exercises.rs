use std::collections::HashSet;

use axum::{Json, Router, extract::{Query, State}, routing::get};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    AppState,
    auth::AuthUser,
    error::AppResult,
    models::{ExerciseKind, ExerciseStatus, TagCategory},
};

pub fn routes() -> Router<AppState> {
    Router::new().route("/exercises", get(search)).route("/tags", get(tags))
}

#[derive(Deserialize)]
struct SearchParams {
    #[serde(default)]
    q: String,
    limit: Option<i64>,
}

#[derive(Serialize)]
struct ExerciseOut {
    id: Uuid,
    slug: Option<String>,
    name: String,
    kind: ExerciseKind,
    status: ExerciseStatus,
    /// Variation tags the query itself asked for ("preacher curl" -> `preacher`).
    /// The client preselects them; empty for plain name searches.
    suggested_tag_ids: Vec<Uuid>,
}

struct Hit {
    id: Uuid,
    slug: Option<String>,
    name: String,
    kind: ExerciseKind,
    status: ExerciseStatus,
    /// The normalised query equals this exercise's name or one of its aliases.
    exact: bool,
}

impl Hit {
    fn into_out(self, suggested_tag_ids: Vec<Uuid>) -> ExerciseOut {
        ExerciseOut {
            id: self.id,
            slug: self.slug,
            name: self.name,
            kind: self.kind,
            status: self.status,
            suggested_tag_ids,
        }
    }
}

fn tokens(text: &str) -> Vec<String> {
    text.to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|t| !t.is_empty())
        .map(String::from)
        .collect()
}

/// Finds variation tags named inside a query. Longer tag names win ("ez bar"
/// before "bar"), and each query word is used at most once. Words may be partial
/// tag names, since search runs while typing ("preach" -> Preacher).
/// Returns the tag ids found and the query words left over.
fn extract_tags(query: &[String], tags: &[(Uuid, String)]) -> (Vec<Uuid>, Vec<String>) {
    let mut phrases: Vec<(Uuid, Vec<String>)> =
        tags.iter().map(|(id, name)| (*id, tokens(name))).filter(|(_, p)| !p.is_empty()).collect();
    phrases.sort_by_key(|(_, p)| std::cmp::Reverse(p.len()));

    let mut used = vec![false; query.len()];
    let mut found = Vec::new();

    // Whole words first, so a complete tag always beats a partial match.
    for (id, phrase) in &phrases {
        let n = phrase.len();
        if n > query.len() {
            continue;
        }
        let at = (0..=query.len() - n)
            .find(|&i| query[i..i + n] == phrase[..] && used[i..i + n].iter().all(|u| !u));
        if let Some(i) = at {
            used[i..i + n].fill(true);
            found.push(*id);
        }
    }

    // Then partial words ("preach", "dumb"), since search runs while typing and
    // people abbreviate. Three letters are needed to guess a single-word tag; a
    // multi-word tag ("ez ba") is already anchored by the words before its last.
    // Where several tags fit, the shortest name wins.
    let mut partial: Vec<(usize, Uuid, usize, usize)> = Vec::new(); // (name len, tag, start, words)
    for (id, phrase) in &phrases {
        let n = phrase.len();
        if found.contains(id) || n > query.len() {
            continue;
        }
        let (head, tail) = phrase.split_at(n - 1);
        let min_len = if n == 1 { 3 } else { 1 };
        for start in 0..=query.len() - n {
            let word = &query[start + n - 1];
            if query[start..start + n - 1] == *head
                && word.len() >= min_len
                && tail[0].starts_with(word.as_str())
            {
                partial.push((phrase.join(" ").len(), *id, start, n));
            }
        }
    }
    partial.sort();
    for (_, id, start, n) in partial {
        if !found.contains(&id) && used[start..start + n].iter().all(|u| !u) {
            used[start..start + n].fill(true);
            found.push(id);
        }
    }

    let rest = query.iter().zip(&used).filter(|(_, u)| !**u).map(|(t, _)| t.clone()).collect();
    (found, rest)
}

/// Matches canonical names and aliases. The query is normalised the same way
/// as `exercise_aliases.alias_normalized` (lowercase, punctuation to spaces).
/// Official exercises and the caller's own are visible; merged and deleted ones are not.
async fn run_search(pool: &PgPool, user_id: Uuid, q: &str, limit: i64) -> AppResult<Vec<Hit>> {
    let rows = sqlx::query_as!(
        Hit,
        r#"with q as (
               select btrim(lower(regexp_replace($1::text, '[^[:alnum:]]+', ' ', 'g'))) as nq
           ), cand as (
               select e.id, e.slug, e.name, e.kind, e.status,
                      btrim(lower(regexp_replace(e.name, '[^[:alnum:]]+', ' ', 'g'))) as nname
                 from exercises e
                where e.deleted_at is null
                  and e.merged_into_id is null
                  and (e.status = 'official' or e.created_by = $2)
           ), scored as (
               select c.*,
                      greatest(
                          similarity(c.nname, q.nq),
                          coalesce((select max(similarity(a.alias_normalized, q.nq))
                                      from exercise_aliases a where a.exercise_id = c.id), 0)
                      ) as score,
                      (c.nname like '%' || q.nq || '%'
                       or exists (select 1 from exercise_aliases a
                                   where a.exercise_id = c.id
                                     and a.alias_normalized like '%' || q.nq || '%')) as contains,
                      (c.nname = q.nq
                       or exists (select 1 from exercise_aliases a
                                   where a.exercise_id = c.id
                                     and a.alias_normalized = q.nq)) as exact
                 from cand c, q
           )
           select id as "id!", slug, name as "name!",
                  kind as "kind!: ExerciseKind", status as "status!: ExerciseStatus",
                  exact as "exact!"
             from scored, q
            where q.nq = '' or contains or score > 0.3
            order by exact desc,
                     (case when q.nq = '' then 0 when contains then 1 else 0 end) desc,
                     score desc, name
            limit $3"#,
        q,
        user_id,
        limit
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// When a query is only tag words ("preacher"), list the exercises that suggest those tags.
async fn exercises_suggesting(pool: &PgPool, user_id: Uuid, tag_ids: &[Uuid], limit: i64) -> AppResult<Vec<Hit>> {
    let rows = sqlx::query_as!(
        Hit,
        r#"select distinct e.id as "id!", e.slug, e.name as "name!",
                  e.kind as "kind!: ExerciseKind", e.status as "status!: ExerciseStatus",
                  false as "exact!"
             from exercises e
             join exercise_variation_tags evt on evt.exercise_id = e.id
            where evt.tag_id = any($1)
              and e.deleted_at is null and e.merged_into_id is null
              and (e.status = 'official' or e.created_by = $2)
            order by e.name
            limit $3"#,
        tag_ids,
        user_id,
        limit
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// Exercise search. If the whole query is not already an exact name or alias, tag
/// words are stripped out and searched separately, so "preacher curl" finds
/// Bicep Curl with `preacher` suggested, while "overhead press" stays Overhead Press.
async fn search(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Query(params): Query<SearchParams>,
) -> AppResult<Json<Vec<ExerciseOut>>> {
    let limit = params.limit.unwrap_or(20).clamp(1, 50);
    let pool = &state.pool;
    let full = run_search(pool, user_id, &params.q, limit).await?;
    let plain = |hits: Vec<Hit>| hits.into_iter().map(|h| h.into_out(Vec::new())).collect::<Vec<_>>();

    let query_tokens = tokens(&params.q);
    if query_tokens.is_empty() || full.iter().any(|h| h.exact) {
        return Ok(Json(plain(full)));
    }

    let tags: Vec<(Uuid, String)> =
        sqlx::query!("select id, name from variation_tags").fetch_all(pool).await?
            .into_iter().map(|t| (t.id, t.name)).collect();
    let (found, rest) = extract_tags(&query_tokens, &tags);
    if found.is_empty() {
        return Ok(Json(plain(full)));
    }

    let only_tag_words = rest.is_empty();
    let stripped = if only_tag_words {
        exercises_suggesting(pool, user_id, &found, limit).await?
    } else {
        run_search(pool, user_id, &rest.join(" "), limit).await?
    };

    // A tag is only suggested where it makes sense: on an exact match of the
    // remaining words, or where the catalog lists it for that exercise.
    let ids: Vec<Uuid> = stripped.iter().map(|h| h.id).collect();
    let linked: HashSet<(Uuid, Uuid)> = sqlx::query!(
        "select exercise_id, tag_id from exercise_variation_tags
          where exercise_id = any($1) and tag_id = any($2)",
        &ids,
        &found
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|r| (r.exercise_id, r.tag_id))
    .collect();

    let suggestions = |h: &Hit| -> Vec<Uuid> {
        found.iter().copied().filter(|t| h.exact || linked.contains(&(h.id, *t))).collect()
    };
    let stripped: Vec<(Uuid, ExerciseOut)> = stripped
        .into_iter()
        .map(|h| {
            let tags = suggestions(&h);
            (h.id, h.into_out(tags))
        })
        .collect();

    let mut out: Vec<ExerciseOut> = Vec::new();
    if only_tag_words {
        // The user may be mid-way through an exercise name ("overhead"), so name
        // matches lead, carrying the suggestion if the catalog lists the tag for them.
        let mut by_id: std::collections::HashMap<Uuid, ExerciseOut> = stripped.into_iter().collect();
        let mut named: Vec<ExerciseOut> = Vec::new();
        for h in full {
            let tags = by_id.remove(&h.id).map(|o| o.suggested_tag_ids).unwrap_or_default();
            named.push(h.into_out(tags));
        }
        let mut tag_only: Vec<ExerciseOut> = by_id.into_values().collect();
        tag_only.sort_by(|a, b| a.name.cmp(&b.name));
        out.extend(named);
        out.extend(tag_only);
    } else {
        let seen: HashSet<Uuid> = stripped.iter().map(|(id, _)| *id).collect();
        out.extend(stripped.into_iter().map(|(_, o)| o));
        out.extend(full.into_iter().filter(|h| !seen.contains(&h.id)).map(|h| h.into_out(Vec::new())));
    }
    out.truncate(limit as usize);
    Ok(Json(out))
}

#[derive(Serialize)]
struct TagOut {
    id: Uuid,
    slug: String,
    name: String,
    category: TagCategory,
}

async fn tags(State(state): State<AppState>, _user: AuthUser) -> AppResult<Json<Vec<TagOut>>> {
    let rows = sqlx::query_as!(
        TagOut,
        r#"select id, slug, name, category as "category: TagCategory"
             from variation_tags order by category, name"#
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(rows))
}
