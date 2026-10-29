import { useEffect, useState } from "react";
import type { Gym } from "../api/types";
import { useGymSearch } from "../lib/useGymSearch";
import { useWorkout } from "../stores/workout";
import { gymLine } from "../lib/gyms";
import { CreateGym } from "./CreateGym";
import { Sheet } from "./Sheet";

type View = "pick" | "create";

export function GymPicker({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const setGym = useWorkout((s) => s.setGym);
  const [view, setView] = useState<View>("pick");
  const [q, setQ] = useState("");
  const { found, loading } = useGymSearch(q, open);

  useEffect(() => {
    if (!open) {
      setView("pick");
      setQ("");
    }
  }, [open]);

  function choose(g: Gym) {
    void setGym(g);
    onOpenChange(false);
  }

  return (
    <Sheet
      tall
      open={open}
      onOpenChange={onOpenChange}
      title={view === "pick" ? "Choose gym" : "New gym"}
      leading={
        view === "create" && (
          <button className="icon-btn" aria-label="Back" onClick={() => setView("pick")}>
            <span aria-hidden>‹</span>
          </button>
        )
      }
    >
      {view === "pick" ? (
        <div className="stack">
          <label className="field">
            <span className="sr-only">Search gyms</span>
            <input type="search" placeholder="Search gyms" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" autoFocus />
          </label>

          {found.length > 0 && (
            <ul className="list" aria-busy={loading} aria-label="Gyms">
              {found.map((g) => (
                <li key={g.id}>
                  <button className="card row-btn" onClick={() => choose(g)}>
                    <span className="card-title">{g.name}</span>
                    <span className="dim small">{gymLine(g)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {loading && found.length === 0 && <p className="dim empty" role="status">Loading gyms…</p>}
          {!loading && found.length === 0 && <p className="dim empty">No gyms found.</p>}
          <button className="btn" onClick={() => setView("create")}>Create new gym</button>
        </div>
      ) : (
        <CreateGym initialName={q.trim()} onCreated={choose} />
      )}
    </Sheet>
  );
}
