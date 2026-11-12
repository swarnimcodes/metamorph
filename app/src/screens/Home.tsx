import { useMemo, useState } from "react";
import { api } from "../api/client";
import { workoutChanged } from "../lib/invalidate";
import { deviceTimeZone } from "../lib/timezone";
import { useHistory } from "../lib/queries";
import { formatDate, formatDuration, formatElapsed, plural } from "../lib/format";
import { toastError } from "../lib/toast";
import { navigate, paths } from "../router";
import { errMsg } from "../stores/auth";
import { useNow } from "../lib/useNow";

export function Home() {
  const { items, pending, hasMore, loadMore, loadingMore, error, retry } = useHistory();
  const [starting, setStarting] = useState(false);

  const unfinished = useMemo(() => items.find((w) => w.ended_at === null), [items]);
  const finished = items.filter((w) => w.ended_at !== null);
  const now = useNow(unfinished ? 1000 : null);

  async function start() {
    setStarting(true);
    try {
      // The server starts the workout at the gym of your last one.
      const w = await api.createWorkout({ timezone: deviceTimeZone() });
      void workoutChanged();
      navigate(paths.workout(w.id));
    } catch (e) {
      toastError(`Couldn't start workout: ${errMsg(e)}`);
      setStarting(false);
    }
  }

  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const thisWeek = finished.filter((w) => new Date(w.started_at).getTime() >= weekAgo).length;
  const months = groupByMonth(finished);

  const startButton = unfinished ? (
    <button className="btn primary resume" data-shortcut="n" title="Resume (n)" onClick={() => navigate(paths.workout(unfinished.id))}>
      <span>Resume workout</span>
      <span className="resume-sub">{formatElapsed(unfinished.started_at, now)}</span>
    </button>
  ) : (
    <button className="btn primary" data-shortcut="n" title="Start workout (n)" onClick={start} disabled={starting || pending}>
      {starting ? "Starting…" : "Start workout"}
    </button>
  );

  return (
    <main className="screen wide">
      <header className="page-head">
        <div>
          <h1>Train</h1>
          {!pending && <p className="dim">{plural(thisWeek, "workout")} this week</p>}
        </div>
        {startButton}
      </header>

      {error && (
        <p className="error" role="alert">
          {error} <button className="link" onClick={retry}>Retry</button>
        </p>
      )}

      {months.map((m) => (
        <section key={m.key} className="month">
          <h2 className="group-title">{m.label}</h2>
          <ul className="history">
            {m.items.map((w) => {
              const custom = w.title && w.title !== "Workout" ? w.title : null;
              const mins = w.ended_at ? Math.round((new Date(w.ended_at).getTime() - new Date(w.started_at).getTime()) / 60000) : 0;
              const meta = [w.gym?.name, mins > 0 ? formatDuration(w.started_at, w.ended_at as string) : null].filter(Boolean);
              return (
                <li key={w.id}>
                  <button className="row" onClick={() => navigate(paths.detail(w.id))}>
                    <span className="row-main">
                      <span className="row-title">{custom ?? formatDate(w.started_at, w.timezone)}</span>
                      <span className="dim small">{[custom ? formatDate(w.started_at, w.timezone) : null, ...meta].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="row-side dim small">
                      {plural(w.exercise_count, "exercise")} · {plural(w.set_count, "set")}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {!pending && !error && finished.length === 0 && !unfinished && <p className="dim empty">No workouts yet. Start your first one.</p>}
      {pending && !error && <p className="dim empty">Loading…</p>}
      {hasMore && (
        <button className="btn quiet" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? "Loading…" : "Show earlier"}
        </button>
      )}
    </main>
  );
}

/** Finished workouts under their month, newest first, as the month was where each was done. */
function groupByMonth<T extends { id: string; started_at: string; timezone?: string | null }>(items: T[]) {
  const out: { key: string; label: string; items: T[] }[] = [];
  const thisYear = new Date().getFullYear();
  for (const w of items) {
    const d = new Date(w.started_at);
    const tz = w.timezone || undefined;
    const parts = new Intl.DateTimeFormat("en", { year: "numeric", month: "numeric", timeZone: tz }).formatToParts(d);
    const y = Number(parts.find((p) => p.type === "year")?.value);
    const key = `${y}-${parts.find((p) => p.type === "month")?.value}`;
    let g = out[out.length - 1];
    if (!g || g.key !== key) {
      const label = d.toLocaleDateString(undefined, { month: "long", ...(y !== thisYear ? { year: "numeric" } : {}), timeZone: tz });
      g = { key, label, items: [] };
      out.push(g);
    }
    g.items.push(w);
  }
  return out;
}
