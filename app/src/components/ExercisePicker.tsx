import { Toggle } from "@base-ui/react/toggle";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { Exercise, Tag, TagCategory } from "../api/types";
import { errMsg } from "../stores/auth";
import { useWorkout } from "../stores/workout";
import { Sheet } from "./Sheet";

const KIND_LABEL = {
  weight_reps: "Weight × reps",
  bodyweight_reps: "Bodyweight",
  duration: "Duration",
  distance: "Distance",
} as const;

const CATEGORY_LABEL: Record<TagCategory, string> = {
  equipment: "Equipment",
  grip: "Grip",
  angle: "Angle",
  stance: "Stance",
  other: "Other",
};
const CATEGORY_ORDER: TagCategory[] = ["equipment", "grip", "angle", "stance", "other"];

let tagCache: Tag[] | null = null;

export function ExercisePicker({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const addExercise = useWorkout((s) => s.addExercise);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Exercise[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Exercise | null>(null);
  const [tags, setTags] = useState<Tag[] | null>(tagCache);
  const [tagsFailed, setTagsFailed] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  // Reset when the sheet closes.
  useEffect(() => {
    if (!open) {
      setQ("");
      setChosen(null);
      setSelected(new Set());
      setError(null);
    }
  }, [open]);

  // Debounced search.
  useEffect(() => {
    if (!open) return;
    let stale = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await api.searchExercises(q.trim());
        if (stale) return;
        setResults(r);
        setError(null);
      } catch (e) {
        if (!stale) setError(errMsg(e));
      } finally {
        if (!stale) setSearching(false);
      }
    }, q ? 250 : 0);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [q, open]);

  // Tags load lazily on the first tag step.
  useEffect(() => {
    if (!chosen || tags) return;
    setTagsFailed(false);
    api.tags().then(
      (t) => {
        tagCache = t;
        setTags(t);
      },
      () => setTagsFailed(true),
    );
  }, [chosen, tags]);

  const grouped = useMemo(
    () =>
      CATEGORY_ORDER.map((c) => ({ category: c, tags: (tags ?? []).filter((t) => t.category === c) })).filter(
        (g) => g.tags.length > 0,
      ),
    [tags],
  );

  async function add() {
    if (!chosen) return;
    setAdding(true);
    const ok = await addExercise(chosen, [...selected]);
    setAdding(false);
    if (ok) onOpenChange(false);
  }

  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={chosen ? chosen.name : "Add exercise"}
      leading={
        chosen && (
          <button className="icon-btn" aria-label="Back to search" onClick={() => setChosen(null)}>
            <span aria-hidden>‹</span>
          </button>
        )
      }
    >
      {!chosen ? (
        <div className="stack">
          <label className="field">
            <span className="sr-only">Search exercises</span>
            <input
              type="search"
              placeholder="Search exercises"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoComplete="off"
              autoFocus
            />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <ul className="list" aria-busy={searching}>
            {results.map((ex) => (
              <li key={ex.id}>
                <button className="card row-btn" onClick={() => setChosen(ex)}>
                  <span className="card-title">{ex.name}</span>
                  <span className="dim small">{KIND_LABEL[ex.kind]}</span>
                </button>
              </li>
            ))}
          </ul>
          {!searching && !error && results.length === 0 && <p className="dim empty">No exercises found.</p>}
        </div>
      ) : (
        <div className="stack">
          <p className="dim">Pick the variation, if any. You can leave this empty.</p>
          {tagsFailed && <p className="error">Couldn't load variations. You can still add the exercise.</p>}
          {!tags && !tagsFailed && <p className="dim">Loading…</p>}
          {grouped.map((g) => (
            <section key={g.category} aria-label={CATEGORY_LABEL[g.category]}>
              <h3 className="group-title">{CATEGORY_LABEL[g.category]}</h3>
              <div className="chips">
                {g.tags.map((t) => (
                  <Toggle
                    key={t.id}
                    className="chip toggle"
                    pressed={selected.has(t.id)}
                    onPressedChange={(on) => toggle(t.id, on)}
                  >
                    {t.name}
                  </Toggle>
                ))}
              </div>
            </section>
          ))}
          <button className="btn primary big sticky-action" onClick={add} disabled={adding}>
            {adding ? "Adding…" : selected.size ? `Add with ${selected.size} variation${selected.size > 1 ? "s" : ""}` : "Add exercise"}
          </button>
        </div>
      )}
    </Sheet>
  );
}
