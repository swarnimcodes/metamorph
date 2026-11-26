import { useState } from "react";
import { CreateGym } from "../components/CreateGym";
import { ExternalLink } from "../components/ExternalLink";
import { PersonRow, RequestRow } from "../components/PersonRow";
import { Sheet } from "../components/Sheet";
import { directionsUrl, gymLine } from "../lib/gyms";
import { useBlocked, useFriendRequests, useFriends, usePeopleSearch, useUnreadCount } from "../lib/queries";
import { useGymSearch } from "../lib/useGymSearch";
import { navigate, paths } from "../router";

type Section = "friends" | "find" | "gyms";
const SECTIONS: { id: Section; label: string }[] = [
  { id: "friends", label: "Friends" },
  { id: "find", label: "Find" },
  { id: "gyms", label: "Gyms" },
];

export function Social() {
  const [section, setSection] = useState<Section>("friends");
  const unread = useUnreadCount();

  return (
    <main className="screen wide">
      <header className="bw-head">
        <h1>Social</h1>
        <button className="icon-btn bell" onClick={() => navigate(paths.notifications)} aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9" />
            <path d="M10 20a2 2 0 0 0 4 0" />
          </svg>
          {unread > 0 && <span className="badge" aria-hidden="true">{unread > 99 ? "99+" : unread}</span>}
        </button>
      </header>

      <div className="social-tabs" role="group" aria-label="Social sections">
        {SECTIONS.map((s) => (
          <button key={s.id} className="btn" aria-pressed={section === s.id} onClick={() => setSection(s.id)}>
            {s.label}
          </button>
        ))}
      </div>

      {section === "friends" && <FriendsSection onFind={() => setSection("find")} />}
      {section === "find" && <FindSection />}
      {section === "gyms" && <GymsSection />}
    </main>
  );
}

function FriendsSection({ onFind }: { onFind: () => void }) {
  const { friends, loading } = useFriends();
  const { incoming, outgoing } = useFriendRequests();
  const blocked = useBlocked();

  return (
    <div className="stack">
      {incoming.length > 0 && (
        <section className="stack" aria-labelledby="requests-h">
          <h2 id="requests-h">Requests · {incoming.length}</h2>
          <ul className="card people-list">
            {incoming.map((p) => <RequestRow key={p.id} person={p} direction="incoming" />)}
          </ul>
        </section>
      )}

      <section className="stack" aria-labelledby="friends-h">
        <h2 id="friends-h">Friends{friends.length > 0 && ` · ${friends.length}`}</h2>
        {loading && <p className="dim empty">Loading…</p>}
        {!loading && friends.length === 0 && (
          <div className="stack">
            <p className="dim empty">No friends yet. Search for someone by name or username.</p>
            <button className="btn" onClick={onFind}>Find people</button>
          </div>
        )}
        {friends.length > 0 && (
          <ul className="card people-list">
            {friends.map((p) => <PersonRow key={p.id} person={p} action={false} />)}
          </ul>
        )}
      </section>

      {outgoing.length > 0 && (
        <section className="stack" aria-labelledby="sent-h">
          <h2 id="sent-h">Sent</h2>
          <ul className="card people-list">
            {outgoing.map((p) => <RequestRow key={p.id} person={p} direction="outgoing" />)}
          </ul>
        </section>
      )}

      {blocked.length > 0 && (
        <details className="stack">
          <summary className="dim">Blocked · {blocked.length}</summary>
          <ul className="card people-list">
            {blocked.map((p) => <PersonRow key={p.id} person={p} />)}
          </ul>
        </details>
      )}
    </div>
  );
}

function FindSection() {
  const [q, setQ] = useState("");
  const { people, searching, tooShort, error } = usePeopleSearch(q);
  const ready = q.trim().length >= 3;

  return (
    <div className="stack">
      <label className="field">
        <span className="sr-only">Search people</span>
        <input type="search" placeholder="Search by name or username" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" autoFocus />
      </label>
      {tooShort && <p className="dim small">Type at least 3 characters.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {people.length > 0 && (
        <ul className="card people-list" aria-busy={searching} aria-label="People">
          {people.map((p) => <PersonRow key={p.id} person={p} />)}
        </ul>
      )}
      {ready && !searching && !error && people.length === 0 && <p className="dim empty">No one found.</p>}
      <p className="dim small">
        People can find you by name or username and see when you joined. Your workouts stay private until you're friends.
      </p>
    </div>
  );
}

function GymsSection() {
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const { found, loading, reload } = useGymSearch(q);

  return (
    <>
      <section className="stack" aria-labelledby="gyms-h">
        <div className="bw-head">
          <h2 id="gyms-h">Gyms</h2>
          <button className="btn" onClick={() => setAdding(true)}>Add gym</button>
        </div>
        <label className="field">
          <span className="sr-only">Search gyms</span>
          <input type="search" data-shortcut="/" title="Search (/)" placeholder="Search by name, area or city" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
        </label>

        {found.length > 0 && (
          <ul className="rows card gym-grid" aria-busy={loading} aria-label="Gyms">
            {found.map((g) => (
              <li key={g.id} className="gym-row">
                <button className="gym-main gym-link" onClick={() => navigate(paths.gym(g.id))} aria-label={`${g.name}, open gym`}>
                  <span className="card-title">{g.name}</span>
                  <span className="dim small">{gymLine(g) || "—"}</span>
                </button>
                <ExternalLink className="btn small-btn" href={directionsUrl(g)} aria-label={`Directions to ${g.name}`}>
                  Directions
                </ExternalLink>
              </li>
            ))}
          </ul>
        )}
        {loading && found.length === 0 && <p className="dim empty" role="status">Loading gyms…</p>}
        {!loading && found.length === 0 && <p className="dim empty">{q.trim() ? "No gyms match." : "No gyms yet."}</p>}
      </section>

      <Sheet open={adding} onOpenChange={setAdding} title="New gym">
        {adding && (
          <CreateGym
            initialName={q.trim()}
            onCreated={() => {
              setAdding(false);
              reload();
            }}
          />
        )}
      </Sheet>
    </>
  );
}
