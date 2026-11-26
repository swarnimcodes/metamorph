import { useState } from "react";
import { api } from "../api/client";
import { formatDate } from "../lib/format";
import { useReports } from "../lib/queries";
import { queryClient } from "../lib/queryClient";
import { keys } from "../lib/queryKeys";
import { toastError } from "../lib/toast";
import { navigate, paths } from "../router";
import { errMsg } from "../stores/auth";

/** The report queue, for moderators and admins. */
export function Reports() {
  const [status, setStatus] = useState<"open" | "resolved">("open");
  const { reports, loading, error } = useReports(status);
  const [busy, setBusy] = useState<string | null>(null);

  async function resolve(id: string) {
    setBusy(id);
    try {
      await api.resolveReport(id);
    } catch (e) {
      toastError(`Couldn't resolve: ${errMsg(e)}`);
    } finally {
      await queryClient.invalidateQueries({ queryKey: keys.reports.all });
      setBusy(null);
    }
  }

  return (
    <main className="screen medium">
      <button className="btn quiet back" onClick={() => navigate(paths.you)}>‹ You</button>
      <header className="stack-sm"><h1>Reports</h1></header>
      <div className="social-tabs" role="group" aria-label="Status">
        {(["open", "resolved"] as const).map((s) => (
          <button key={s} className="btn" aria-pressed={status === s} onClick={() => setStatus(s)}>
            {s === "open" ? "Open" : "Resolved"}
          </button>
        ))}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {loading && <p className="dim empty">Loading…</p>}
      {!loading && reports.length === 0 && <p className="dim empty">{status === "open" ? "No open reports." : "Nothing resolved yet."}</p>}
      {reports.length > 0 && (
        <ul className="stack">
          {reports.map((r) => (
            <li key={r.id} className="card stack-sm">
              <p>
                <button className="quiet-link" onClick={() => navigate(paths.person(r.target.id))}>{r.target.display_name}</button>
                <span className="dim small"> @{r.target.username}{r.workout_id ? " · a workout" : ""}</span>
              </p>
              <p>{r.reason}</p>
              <p className="dim small">{formatDate(r.at)}{r.reporter ? ` · reported by @${r.reporter.username}` : ""}</p>
              {r.status === "open" && (
                <button className="btn small-btn" disabled={busy === r.id} onClick={() => void resolve(r.id)}>Mark resolved</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
