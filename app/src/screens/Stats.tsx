import { BodyWeightCard } from "../components/BodyWeightCard";
import { Heatmap } from "../components/Heatmap";
import { formatDay } from "../lib/format";
import { navigate, paths } from "../router";
import { useAuth } from "../stores/auth";
import { useConsistency, useStatsExercises } from "../lib/queries";

export function Stats() {
  const unit = useAuth((s) => s.user?.unit_system ?? "metric");
  const { data: consistency, error: consistencyError, retry: retryConsistency } = useConsistency();
  const { data: exercises, error: exercisesError, retry: retryExercises } = useStatsExercises();

  const t = consistency?.totals;
  const summary = consistency
    ? [
        { label: "Current streak", value: `${consistency.streak.current_weeks} wk` },
        { label: "Longest streak", value: `${consistency.streak.longest_weeks} wk` },
        { label: "Workouts", value: String(t?.workouts ?? 0) },
        { label: "Active days", value: String(t?.active_days ?? 0) },
      ]
    : [];

  return (
    <main className="screen">
      <header className="stack-sm">
        <h1>Progress</h1>
        {consistency && <p className="dim">{formatDay(consistency.from)} to {formatDay(consistency.to)}</p>}
      </header>

      {consistencyError && (
        <p className="error" role="alert">
          {consistencyError} <button className="link" onClick={retryConsistency}>Retry</button>
        </p>
      )}
      {!consistency && !consistencyError && <p className="dim empty">Loading…</p>}

      {consistency && (
        <>
          <dl className="summary">
            {summary.map((s) => (
              <div key={s.label}>
                <dd>{s.value}</dd>
                <dt>{s.label}</dt>
              </div>
            ))}
          </dl>

          <section className="card stack" aria-labelledby="consistency-h">
            <h2 id="consistency-h">Consistency</h2>
            <Heatmap data={consistency} unit={unit} />
          </section>
        </>
      )}

      <BodyWeightCard />

      <section className="stack" aria-labelledby="progress-h">
        <h2 id="progress-h">Exercise progress</h2>
        {exercisesError && (
          <p className="error" role="alert">
            {exercisesError} <button className="link" onClick={retryExercises}>Retry</button>
          </p>
        )}
        {exercises && exercises.length === 0 && (
          <p className="dim">Log your first workout and your exercises will show up here.</p>
        )}
        {exercises && exercises.length > 0 && (
          <ul className="rows card">
            {exercises.map((x) => (
              <li key={`${x.exercise_id}|${x.variant_key}`}>
                <button className="row-link" onClick={() => navigate(paths.exercise(x.exercise_id, x.variant_key))}>
                  <span className="card-title">
                    {x.name}
                    {x.variant_label && <span className="dim"> · {x.variant_label}</span>}
                  </span>
                  <span className="dim small">
                    {x.sessions} {x.sessions === 1 ? "session" : "sessions"} · last {formatDay(x.last_performed, false)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
