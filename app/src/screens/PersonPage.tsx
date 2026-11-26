import { useState } from "react";
import { Avatar } from "../components/Avatar";
import { ReportSheet } from "../components/ReportSheet";
import { Confirm } from "../components/Sheet";
import { formatDate } from "../lib/format";
import { usePerson, usePersonWorkouts } from "../lib/queries";
import { usePersonActions } from "../lib/usePersonActions";
import { navigate, paths } from "../router";
import type { PersonProfile } from "../api/types";

function memberSince(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function PersonPage({ id }: { id: string }) {
  const { person, error, reload } = usePerson(id);
  const back = () => (window.history.length > 1 ? window.history.back() : navigate(paths.social));

  return (
    <main className="screen medium">
      <button className="btn quiet back" onClick={back}>‹ Back</button>
      {error && (
        <div className="stack">
          <p className="error" role="alert">{error}</p>
          <button className="btn" onClick={reload}>Retry</button>
        </div>
      )}
      {!person && !error && <p className="dim empty">Loading…</p>}
      {person && <Profile person={person} />}
    </main>
  );
}

function Profile({ person }: { person: PersonProfile }) {
  const { busy, send, accept, remove, block, unblock } = usePersonActions();
  const [reporting, setReporting] = useState(false);
  const [confirm, setConfirm] = useState<"unfriend" | "block" | null>(null);
  const rel = person.relationship;
  const isFriend = rel === "friends";
  const { workouts, loading } = usePersonWorkouts(person.id, isFriend);

  return (
    <>
      <header className="profile-head">
        <Avatar name={person.display_name} url={person.avatar_url} size={72} />
        <div className="stack-sm">
          <h1>{person.display_name}</h1>
          <p className="dim">@{person.username}</p>
        </div>
      </header>

      {rel !== "self" && (
        <div className="gym-actions">
          {rel === "none" && <button className="btn primary" disabled={busy} onClick={() => void send(person.id)}>Add friend</button>}
          {rel === "request_sent" && (
            <>
              <span className="chip static">Request sent</span>
              <button className="btn" disabled={busy} onClick={() => void remove(person.id, true)}>Cancel</button>
            </>
          )}
          {rel === "request_received" && (
            <>
              <button className="btn primary" disabled={busy} onClick={() => void accept(person.id)}>Accept</button>
              <button className="btn" disabled={busy} onClick={() => void remove(person.id, true)}>Decline</button>
            </>
          )}
          {isFriend && <button className="btn" disabled={busy} onClick={() => setConfirm("unfriend")}>Friends ✓</button>}
          {rel === "blocked" && <button className="btn" disabled={busy} onClick={() => void unblock(person.id)}>Unblock</button>}
          {rel !== "blocked" && <button className="btn quiet" onClick={() => setConfirm("block")}>Block</button>}
          <button className="btn quiet" onClick={() => setReporting(true)}>Report</button>
        </div>
      )}

      <section className="card stack-sm" aria-label="About">
        <p className="dim">Member since {memberSince(person.member_since)}</p>
        <p>{person.workouts === 1 ? "1 workout" : `${person.workouts} workouts`}</p>
        {isFriend && person.friends_since && <p className="dim">Friends since {formatDate(person.friends_since)}</p>}
        {!isFriend && rel !== "self" && rel !== "blocked" && (
          <p className="dim small">Become friends to see each other's workouts.</p>
        )}
      </section>

      {isFriend && (
        <section className="stack" aria-labelledby="friend-workouts-h">
          <h2 id="friend-workouts-h">Workouts</h2>
          {loading && <p className="dim empty">Loading…</p>}
          {!loading && workouts.length === 0 && <p className="dim empty">No workouts yet.</p>}
          {workouts.length > 0 && (
            <ul className="card history">
              {workouts.map((w) => (
                <li key={w.id}>
                  <button className="row" onClick={() => navigate(paths.friendWorkout(person.id, w.id))}>
                    <span className="row-main">
                      <span className="row-title">{w.title || formatDate(w.started_at, w.timezone)}</span>
                      <span className="row-meta">
                        {[w.title ? formatDate(w.started_at, w.timezone) : null, w.gym?.name].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="row-side dim small">{w.exercise_count} exercises · {w.set_count} sets</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <ReportSheet open={reporting} onOpenChange={setReporting} userId={person.id} title={`Report ${person.display_name}`} />
      <Confirm
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === "block" ? `Block ${person.display_name}?` : `Unfriend ${person.display_name}?`}
        description={
          confirm === "block"
            ? "You won't see each other anywhere, and any friendship ends. You can unblock later."
            : "You'll stop seeing each other's workouts. You can send a new request later."
        }
        confirmLabel={confirm === "block" ? "Block" : "Unfriend"}
        busy={busy}
        onConfirm={() => {
          const action = confirm === "block" ? block(person.id) : remove(person.id);
          void action.then(() => setConfirm(null));
        }}
      />
    </>
  );
}
