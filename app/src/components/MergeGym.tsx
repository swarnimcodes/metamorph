import { useState } from "react";
import { api } from "../api/client";
import type { Gym } from "../api/types";
import { gymLine } from "../lib/gyms";
import { gymEdited } from "../lib/invalidate";
import { useGymSearch } from "../lib/useGymSearch";
import { errMsg } from "../stores/auth";
import { Confirm } from "./Sheet";

/** Pick the gym that stays; the one being viewed is folded into it. */
export function MergeGym({ gym, onMerged }: { gym: Gym; onMerged: (target: Gym) => void }) {
  const [q, setQ] = useState("");
  const { found, loading } = useGymSearch(q);
  const [target, setTarget] = useState<Gym | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const candidates = found.filter((g) => g.id !== gym.id);

  async function merge() {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const kept = await api.mergeGym(gym.id, target.id);
      await gymEdited();
      onMerged(kept);
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
      setTarget(null);
    }
  }

  return (
    <div className="stack">
      <p className="dim">
        Pick the gym to keep. Workouts logged at “{gym.name}” move to it, and “{gym.name}” is hidden.
      </p>
      <label className="field">
        <span className="sr-only">Search gyms</span>
        <input type="search" placeholder="Search gyms" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" autoFocus />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      {candidates.length > 0 && (
        <ul className="list" aria-busy={loading} aria-label="Gyms">
          {candidates.map((g) => (
            <li key={g.id}>
              <button className="card row-btn" onClick={() => setTarget(g)}>
                <span className="card-title">{g.name}</span>
                <span className="dim small">{gymLine(g)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!loading && candidates.length === 0 && <p className="dim empty">No other gyms found.</p>}
      <Confirm
        open={target !== null}
        onOpenChange={(o) => !o && setTarget(null)}
        title={`Merge into ${target?.name ?? ""}?`}
        description={`Everything logged at “${gym.name}” moves to “${target?.name ?? ""}” and “${gym.name}” is hidden. This can't be undone from the app.`}
        confirmLabel="Merge"
        busy={busy}
        onConfirm={() => void merge()}
      />
    </div>
  );
}
