import { useState } from "react";
import { api } from "../api/client";
import type { GymEdit } from "../api/types";
import { EditGym } from "../components/EditGym";
import { ExternalLink } from "../components/ExternalLink";
import { MergeGym } from "../components/MergeGym";
import { Confirm, Sheet } from "../components/Sheet";
import { formatDate, plural } from "../lib/format";
import { describeEdit, editTitle, placeLine } from "../lib/gymHistory";
import { directionsUrl } from "../lib/gyms";
import { gymEdited } from "../lib/invalidate";
import { useGym, useGymHistory } from "../lib/queries";
import { toastError } from "../lib/toast";
import { navigate, paths } from "../router";
import { errMsg } from "../stores/auth";

export function GymPage({ id }: { id: string }) {
  const { detail, error, reload } = useGym(id);
  const { edits } = useGymHistory(id);
  const [editing, setEditing] = useState(false);
  const [merging, setMerging] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);

  const back = () => (window.history.length > 1 ? window.history.back() : navigate(paths.social));

  /** Runs a moderation action; whatever happens, the page and everything that names the gym are re-checked. */
  async function act(what: string, fn: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    try {
      await fn();
      return true;
    } catch (e) {
      toastError(`Couldn't ${what}: ${errMsg(e)}`);
      return false;
    } finally {
      await gymEdited();
      setBusy(false);
    }
  }

  async function remove() {
    if (await act("delete the gym", () => api.deleteGym(id))) navigate(paths.social, { replace: true });
    else setDeleting(false);
  }

  const can = detail?.can;
  const staffNote = detail && !can?.edit && detail.gym.verified;

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
      {detail && can && (
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
            {can.edit && <button className="btn" onClick={() => setEditing(true)}>Edit</button>}
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
            {staffNote && <p className="dim small">Verified gyms are curated: only moderators can edit them.</p>}
          </section>

          {(can.verify || can.merge || can.delete) && (
            <section className="card stack" aria-label="Moderation">
              <h2>Moderation</h2>
              <div className="gym-actions">
                {can.verify && (
                  <button className="btn" disabled={busy} onClick={() => void act(detail.gym.verified ? "remove verification" : "verify the gym", () => api.setGymVerified(id, !detail.gym.verified))}>
                    {detail.gym.verified ? "Remove verification" : "Mark verified"}
                  </button>
                )}
                {can.merge && <button className="btn" disabled={busy} onClick={() => setMerging(true)}>Merge into…</button>}
                {can.delete && <button className="btn danger-text" disabled={busy} onClick={() => setDeleting(true)}>Delete gym</button>}
              </div>
            </section>
          )}

          {edits.length > 0 && (
            <section className="stack" aria-labelledby="gym-history-h">
              <h2 id="gym-history-h">Changes</h2>
              <ul className="card history-list">
                {edits.map((e) => (
                  <HistoryItem key={e.id} edit={e} busy={busy} onRevert={() => void act("revert the edit", () => api.revertGymEdit(id, e.id))} />
                ))}
              </ul>
            </section>
          )}

          <Sheet open={editing} onOpenChange={setEditing} title="Edit gym">
            {editing && <EditGym gym={detail.gym} onSaved={() => setEditing(false)} />}
          </Sheet>
          <Sheet open={merging} onOpenChange={setMerging} title="Merge gym" tall>
            {merging && (
              <MergeGym
                gym={detail.gym}
                onMerged={(kept) => {
                  setMerging(false);
                  navigate(paths.gym(kept.id), { replace: true });
                }}
              />
            )}
          </Sheet>
          <Confirm
            open={deleting}
            onOpenChange={setDeleting}
            title={`Delete ${detail.gym.name}?`}
            description="The gym is hidden from everyone. Workouts logged there keep it."
            confirmLabel="Delete"
            busy={busy}
            onConfirm={() => void remove()}
          />
        </>
      )}
    </main>
  );
}

function HistoryItem({ edit, busy, onRevert }: { edit: GymEdit; busy: boolean; onRevert: () => void }) {
  const title = editTitle(edit);
  const who = edit.by_me ? "You" : (edit.by ?? "A member");
  return (
    <li data-reverted={edit.reverted || undefined}>
      <p className="dim small">
        {formatDate(edit.at)} · {who}
        {edit.reverted && " · reverted"}
      </p>
      {title && <p>{title}</p>}
      {describeEdit(edit).map((line) => (
        <p key={line}>{line}</p>
      ))}
      {edit.revertible && (
        <button className="btn quiet small-btn revert" disabled={busy} onClick={onRevert}>
          Revert
        </button>
      )}
    </li>
  );
}
