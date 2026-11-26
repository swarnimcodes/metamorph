import { useState } from "react";
import { EditGym } from "../components/EditGym";
import { ExternalLink } from "../components/ExternalLink";
import { Sheet } from "../components/Sheet";
import { formatDate, plural } from "../lib/format";
import { describeEdit, placeLine } from "../lib/gymHistory";
import { directionsUrl } from "../lib/gyms";
import { useGym, useGymHistory } from "../lib/queries";
import { navigate, paths } from "../router";

export function GymPage({ id }: { id: string }) {
  const { detail, error, reload } = useGym(id);
  const { edits } = useGymHistory(id);
  const [editing, setEditing] = useState(false);

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
      {!detail && !error && <p className="dim empty">Loading…</p>}
      {detail && (
        <>
          <header className="stack-sm">
            <h1>{detail.gym.name}</h1>
            <p className="dim">
              {[detail.gym.chain, placeLine(detail.gym)].filter(Boolean).join(" · ") || "No location yet"}
              {detail.gym.verified && <span className="chip static verified"> Verified</span>}
            </p>
          </header>

          <div className="gym-actions">
            <ExternalLink className="btn" href={directionsUrl(detail.gym)} aria-label={`Directions to ${detail.gym.name}`}>
              Directions
            </ExternalLink>
            {detail.editable && (
              <button className="btn" onClick={() => setEditing(true)}>Edit</button>
            )}
          </div>

          <section className="card stack-sm" aria-label="Details">
            {detail.gym.address && <p>{detail.gym.address}</p>}
            {detail.gym.maps_url && (
              <p>
                <ExternalLink href={detail.gym.maps_url} className="quiet-link">Open in Maps</ExternalLink>
              </p>
            )}
            <p className="dim">
              {detail.visits > 0
                ? `You've trained here ${plural(detail.visits, "time")}${detail.last_visit ? ` · last ${formatDate(detail.last_visit)}` : ""}`
                : "You haven't trained here yet"}
            </p>
            {!detail.editable && (
              <p className="dim small">Verified gyms are curated, so their details can't be edited.</p>
            )}
          </section>

          {edits.length > 0 && (
            <section className="stack" aria-labelledby="gym-history-h">
              <h2 id="gym-history-h">Changes</h2>
              <ul className="card history-list">
                {edits.map((e) => (
                  <li key={e.id}>
                    <p className="dim small">{formatDate(e.at)} · {e.by_me ? "You" : "A member"}</p>
                    {describeEdit(e).map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <Sheet open={editing} onOpenChange={setEditing} title="Edit gym">
            {editing && <EditGym gym={detail.gym} onSaved={() => setEditing(false)} />}
          </Sheet>
        </>
      )}
    </main>
  );
}
