import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Workout } from "../api/types";
import { Confirm } from "../components/Sheet";
import { directionsUrl } from "../lib/gyms";
import { formatDate, formatDuration, formatSet, formatTime, plural } from "../lib/format";
import { toastError } from "../lib/toast";
import { navigate, paths } from "../router";
import { errMsg, useAuth } from "../stores/auth";
import { useHistory } from "../stores/history";

export function WorkoutDetail({ id }: { id: string }) {
  const unit = useAuth((s) => s.user?.unit_system ?? "metric");
  const reloadHistory = useHistory((s) => s.reload);
  const [w, setW] = useState<Workout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setW(null);
    setError(null);
    api.getWorkout(id).then(setW, (e) => setError(errMsg(e)));
  }, [id]);

  async function remove() {
    setBusy(true);
    try {
      await api.deleteWorkout(id);
      void reloadHistory();
      navigate(paths.home);
    } catch (e) {
      toastError(`Couldn't delete workout: ${errMsg(e)}`);
      setBusy(false);
      setConfirm(false);
    }
  }


  return (
    <main className="screen">
      <button className="btn quiet back" onClick={() => navigate(paths.home)}>‹ History</button>
      {error && <p className="error" role="alert">{error}</p>}
      {!w && !error && <p className="dim empty">Loading…</p>}
      {w && (
        <>
          <header className="stack-sm">
            <h1>{w.title || "Workout"}</h1>
            <p className="dim">
              {formatDate(w.started_at)} · {formatTime(w.started_at)}
              {w.ended_at && ` · ${formatDuration(w.started_at, w.ended_at)}`}
              {w.gym && ` · ${w.gym.name}`}
            </p>
            {w.gym && (
              <p>
                <a className="chip action" href={directionsUrl(w.gym)} target="_blank" rel="noopener noreferrer" aria-label={`Directions to ${w.gym.name}`}>
                  Directions
                </a>
              </p>
            )}
          </header>

          {w.exercises.length === 0 && <p className="dim empty">Nothing was logged.</p>}
          <div className="stack-lg">
            {w.exercises.map((we) => (
              <section key={we.id} className="card exercise" aria-label={we.exercise_name}>
                <h2>
                  <a
                    className="exercise-link"
                    href={`#${paths.exercise(we.exercise_id, we.variant_key, paths.detail(id))}`}
                    aria-label={`${we.exercise_name}, view progress`}
                  >
                    <span>{we.exercise_name}</span>
                    <span className="exercise-link-chevron" aria-hidden="true">›</span>
                  </a>
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
                        <span>{formatSet(s, unit) || "—"}</span>
                        {s.set_type !== "working" && <span className="chip static">{s.set_type}</span>}
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            ))}
          </div>

          <button className="btn quiet danger-text" onClick={() => setConfirm(true)}>Delete workout</button>
          <Confirm
            open={confirm}
            onOpenChange={setConfirm}
            title="Delete workout?"
            description="This removes it from your history."
            confirmLabel="Delete"
            onConfirm={() => void remove()}
            busy={busy}
          />
        </>
      )}
    </main>
  );
}
