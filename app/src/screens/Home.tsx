import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { formatDate, formatDuration, formatElapsed, plural } from "../lib/format";
import { toastError } from "../lib/toast";
import { navigate, paths } from "../router";
import { errMsg, useAuth } from "../stores/auth";
import { useHistory } from "../stores/history";
import { useNow } from "../lib/useNow";

export function Home() {
  const user = useAuth((s) => s.user);
  const { items, loading, loaded, hasMore, error, reload, loadMore } = useHistory();
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    void reload();
  }, [reload]);

  const unfinished = useMemo(() => items.find((w) => w.ended_at === null), [items]);
  const finished = items.filter((w) => w.ended_at !== null);
  const now = useNow(unfinished ? 1000 : null);

  async function start() {
    setStarting(true);
    try {
      // The server starts the workout at the gym of your last one.
      const w = await api.createWorkout({});
      navigate(paths.workout(w.id));
    } catch (e) {
      toastError(`Couldn't start workout: ${errMsg(e)}`);
      setStarting(false);
    }
  }

  return (
    <main className="screen">
      <header className="top">
        <div>
          <h1>Train</h1>
          <p className="dim">{user?.display_name}</p>
        </div>
      </header>

      {unfinished ? (
        <button className="btn primary big resume" onClick={() => navigate(paths.workout(unfinished.id))}>
          <span>Resume workout</span>
          <span className="resume-sub">
            {unfinished.title || "Workout"} · {formatElapsed(unfinished.started_at, now)}
          </span>
        </button>
      ) : (
        <button className="btn primary big" onClick={start} disabled={starting || (!loaded && loading)}>
          {starting ? "Starting…" : "Start workout"}
        </button>
      )}

      {error && (
        <p className="error" role="alert">
          {error} <button className="link" onClick={() => void reload()}>Retry</button>
        </p>
      )}

      <ul className="list">
        {finished.map((w) => {
          const gym = w.gym?.name;
          return (
            <li key={w.id}>
              <button className="card row-btn" onClick={() => navigate(paths.detail(w.id))}>
                <span className="card-title">{w.title || "Workout"}</span>
                <span className="dim">
                  {formatDate(w.started_at)}
                  {w.ended_at && ` · ${formatDuration(w.started_at, w.ended_at)}`}
                  {gym && ` · ${gym}`}
                </span>
                <span className="dim small">
                  {plural(w.exercise_count, "exercise")} · {plural(w.set_count, "set")}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {loaded && finished.length === 0 && !unfinished && <p className="dim empty">No workouts yet. Start your first one.</p>}
      {loading && !loaded && <p className="dim empty">Loading…</p>}
      {hasMore && (
        <button className="btn" onClick={() => void loadMore()} disabled={loading}>
          {loading ? "Loading…" : "Load more"}
        </button>
      )}
    </main>
  );
}
