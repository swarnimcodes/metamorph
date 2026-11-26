import { useState } from "react";
import { api } from "../api/client";
import type { AdminUser } from "../api/types";
import { Avatar } from "../components/Avatar";
import { Confirm } from "../components/Sheet";
import { useAdminUsers } from "../lib/queries";
import { queryClient } from "../lib/queryClient";
import { keys } from "../lib/queryKeys";
import { toastError, toastInfo } from "../lib/toast";
import { navigate, paths } from "../router";
import { errMsg, useAuth } from "../stores/auth";

type Filter = "all" | "staff";

/** Admins only: find people and make them moderators, or take it away. Admins themselves change in the database. */
export function AdminPeople() {
  const me = useAuth((s) => s.user);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const { users, loading, error } = useAdminUsers(q, filter);
  const [target, setTarget] = useState<AdminUser | null>(null);
  const [busy, setBusy] = useState(false);

  if (me && me.role !== "admin") {
    return (
      <main className="screen medium">
        <p className="dim empty">Only admins can manage roles.</p>
      </main>
    );
  }

  const promoting = target?.role === "user";

  async function change() {
    if (!target) return;
    setBusy(true);
    try {
      await api.setUserRole(target.id, promoting ? "moderator" : "user");
      toastInfo(promoting ? `${target.display_name} is now a moderator` : `${target.display_name} is no longer a moderator`);
    } catch (e) {
      toastError(`Couldn't change the role: ${errMsg(e)}`);
    } finally {
      await queryClient.invalidateQueries({ queryKey: keys.admin.all });
      setBusy(false);
      setTarget(null);
    }
  }

  return (
    <main className="screen medium">
      <button className="btn quiet back" onClick={() => navigate(paths.you)}>‹ You</button>
      <header className="stack-sm">
        <h1>People &amp; roles</h1>
        <p className="dim">Moderators can edit verified gyms, merge duplicates, revert edits and work the reports.</p>
      </header>

      <div className="social-tabs two" role="group" aria-label="Show">
        {(["all", "staff"] as const).map((f) => (
          <button key={f} className="btn" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === "all" ? "Everyone" : "Moderators & admins"}
          </button>
        ))}
      </div>
      <label className="field">
        <span className="sr-only">Search people</span>
        <input type="search" placeholder="Search by name or username" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
      </label>

      {error && <p className="error" role="alert">{error}</p>}
      {users.length > 0 && (
        <ul className="card people-list" aria-busy={loading} aria-label="People">
          {users.map((u) => (
            <li key={u.id} className="person-row">
              <span className="person-main static">
                <Avatar name={u.display_name} />
                <span className="person-text">
                  <span className="card-title">{u.display_name}{u.id === me?.id && " (you)"}</span>
                  <span className="dim small">@{u.username} · {u.role}</span>
                </span>
              </span>
              {u.id !== me?.id && u.role === "user" && <button className="btn small-btn" disabled={busy} onClick={() => setTarget(u)}>Make moderator</button>}
              {u.id !== me?.id && u.role === "moderator" && <button className="btn quiet small-btn" disabled={busy} onClick={() => setTarget(u)}>Remove</button>}
            </li>
          ))}
        </ul>
      )}
      {!loading && !error && users.length === 0 && <p className="dim empty">{q.trim() ? "No one matches." : "No one here yet."}</p>}
      <p className="dim small">Admins are made and removed in the database, so they can't be changed here. Every change made here is recorded.</p>

      <Confirm
        open={target !== null}
        onOpenChange={(o) => !o && setTarget(null)}
        title={promoting ? `Make ${target?.display_name} a moderator?` : `Remove ${target?.display_name} as moderator?`}
        description={
          promoting
            ? "They'll be able to edit verified gyms, merge duplicates, revert edits, and see who made each edit and the reports. They see the change the next time they open the app."
            : "They go back to being an ordinary user. They see the change the next time they open the app."
        }
        confirmLabel={promoting ? "Make moderator" : "Remove"}
        tone={promoting ? "normal" : "danger"}
        busy={busy}
        onConfirm={() => void change()}
      />
    </main>
  );
}
