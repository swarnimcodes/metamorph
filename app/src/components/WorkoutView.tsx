import type { UnitSystem, Workout } from "../api/types";
import { formatDate, formatDuration, formatSet, formatTime, plural } from "../lib/format";
import { directionsUrl } from "../lib/gyms";
import { exerciseUnit } from "../lib/units";
import { navigate, paths } from "../router";
import { ExternalLink } from "./ExternalLink";

/**
 * A finished workout: when, where, and every exercise with its sets. Yours and a friend's look the same. A link
 * to the exercise's progress page is offered only when `progressFrom` is given, because that page is about
 * your own history of the exercise and would be confusing from a friend's workout.
 */
export function WorkoutView({ w, unit, progressFrom }: { w: Workout; unit: UnitSystem; progressFrom?: string }) {
  return (
    <>
      <header className="stack-sm">
        <h1>{w.title || "Workout"}</h1>
        <p className="dim">
          {formatDate(w.started_at, w.timezone)} · {formatTime(w.started_at, w.timezone)}
          {w.ended_at && ` · ${formatDuration(w.started_at, w.ended_at)}`}
        </p>
        {w.gym && (
          <p className="gym-actions">
            <button className="chip action" onClick={() => navigate(paths.gym(w.gym!.id))}>{w.gym.name}</button>
            <ExternalLink className="chip action" href={directionsUrl(w.gym)} aria-label={`Directions to ${w.gym.name}`}>
              Directions
            </ExternalLink>
          </p>
        )}
      </header>

      {w.exercises.length === 0 && <p className="dim empty">Nothing was logged.</p>}
      <div className="stack-lg exercises-grid">
        {w.exercises.map((we) => (
          <section key={we.id} className="card exercise" aria-label={we.exercise_name}>
            <h2>
              {progressFrom ? (
                <a
                  className="exercise-link"
                  href={`#${paths.exercise(we.exercise_id, we.variant_key, progressFrom)}`}
                  aria-label={`${we.exercise_name}, view progress`}
                >
                  <span>{we.exercise_name}</span>
                  <span className="exercise-link-chevron" aria-hidden="true">›</span>
                </a>
              ) : (
                we.exercise_name
              )}
            </h2>
            {we.tags.length > 0 && (
              <div className="chips">
                {we.tags.map((t) => (
                  <span key={t.id} className="chip static">{t.name}</span>
                ))}
              </div>
            )}
            {we.sets.length === 0 ? (
              <p className="dim">{plural(0, "set")}</p>
            ) : (
              <ol className="recap">
                {we.sets.map((s, i) => (
                  <li key={s.id} data-type={s.set_type}>
                    <span className="recap-n">{i + 1}</span>
                    <span>{formatSet(s, exerciseUnit(we, unit)) || "—"}</span>
                    {s.set_type !== "working" && <span className="chip static">{s.set_type}</span>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
