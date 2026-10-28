import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../api/client";
import type { Gym, NewGym, SavedGym } from "../api/types";
import { toastError } from "../lib/toast";
import { errMsg } from "../stores/auth";
import { useWorkout } from "../stores/workout";
import { Sheet } from "./Sheet";

type View = "pick" | "create";

const gymLine = (g: Gym) => [g.chain, g.city].filter(Boolean).join(" · ");

export function GymPicker({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const setGym = useWorkout((s) => s.setGym);
  const [view, setView] = useState<View>("pick");
  const [q, setQ] = useState("");
  const [saved, setSaved] = useState<SavedGym[]>([]);
  const [found, setFound] = useState<Gym[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setView("pick");
      setQ("");
      return;
    }
    api.myGyms().then(setSaved, (e) => toastError(`Couldn't load your gyms: ${errMsg(e)}`));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let stale = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await api.searchGyms(q.trim());
        if (!stale) setFound(r);
      } catch (e) {
        if (!stale) toastError(`Couldn't search gyms: ${errMsg(e)}`);
      } finally {
        if (!stale) setLoading(false);
      }
    }, q ? 250 : 0);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [q, open]);

  function choose(g: Gym) {
    void setGym(g);
    onOpenChange(false);
  }

  async function makeDefault(g: SavedGym) {
    try {
      await api.setDefaultGym(g.id);
      setSaved((all) => all.map((x) => ({ ...x, is_default: x.id === g.id })));
    } catch (e) {
      toastError(`Couldn't set default: ${errMsg(e)}`);
    }
  }

  const needle = q.trim().toLowerCase();
  const savedShown = saved.filter((g) => !needle || `${g.name} ${g.chain ?? ""}`.toLowerCase().includes(needle));
  const savedIds = new Set(saved.map((g) => g.id));
  const others = found.filter((g) => !savedIds.has(g.id));

  return (
    <Sheet
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

          {savedShown.length > 0 && (
            <section aria-label="Your gyms">
              <h3 className="group-title">Your gyms</h3>
              <ul className="list">
                {savedShown.map((g) => (
                  <li key={g.id} className="gym-item">
                    <button className="card row-btn" onClick={() => choose(g)}>
                      <span className="card-title">{g.name}</span>
                      <span className="dim small">{gymLine(g)}</span>
                    </button>
                    {g.is_default ? (
                      <span className="chip static">Default</span>
                    ) : (
                      <button className="btn quiet" onClick={() => void makeDefault(g)} aria-label={`Make ${g.name} the default gym`}>
                        Make default
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {others.length > 0 && (
            <section aria-label="All gyms">
              <h3 className="group-title">All gyms</h3>
              <ul className="list" aria-busy={loading}>
                {others.map((g) => (
                  <li key={g.id}>
                    <button className="card row-btn" onClick={() => choose(g)}>
                      <span className="card-title">{g.name}</span>
                      <span className="dim small">{gymLine(g)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {!loading && savedShown.length === 0 && others.length === 0 && <p className="dim empty">No gyms found.</p>}
          <button className="btn" onClick={() => setView("create")}>Create new gym</button>
        </div>
      ) : (
        <CreateGym initialName={q.trim()} onCreated={choose} />
      )}
    </Sheet>
  );
}

function CreateGym({ initialName, onCreated }: { initialName: string; onCreated: (g: Gym) => void }) {
  const [form, setForm] = useState({ name: initialName, chain: "", city: "", address: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [similar, setSimilar] = useState<Gym[] | null>(null);

  async function create(force: boolean) {
    const body: NewGym = { name: form.name.trim() };
    if (form.chain.trim()) body.chain = form.chain.trim();
    if (form.city.trim()) body.city = form.city.trim();
    if (form.address.trim()) body.address = form.address.trim();
    if (force) body.force = true;
    setBusy(true);
    setError(null);
    try {
      onCreated(await api.createGym(body));
    } catch (e) {
      setBusy(false);
      if (e instanceof ApiError && e.status === 409) {
        const list = (e.data as { similar?: Gym[] } | undefined)?.similar;
        setSimilar(Array.isArray(list) ? list : []);
      } else {
        setError(errMsg(e));
      }
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (form.name.trim()) void create(false);
  };
  const field = (key: keyof typeof form, label: string, required = false) => (
    <label className="field">
      <span>{label}</span>
      <input value={form[key]} required={required} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </label>
  );

  if (similar) {
    return (
      <div className="stack">
        <h3 className="group-title">{similar.length ? "Did you mean…?" : "Possible duplicate"}</h3>
        <ul className="list">
          {similar.map((g) => (
            <li key={g.id}>
              <button className="card row-btn" onClick={() => onCreated(g)}>
                <span className="card-title">{g.name}</span>
                <span className="dim small">{[gymLine(g), g.address].filter(Boolean).join(" · ")}</span>
              </button>
            </li>
          ))}
        </ul>
        <button className="btn" onClick={() => void create(true)} disabled={busy}>Create anyway</button>
        <button className="btn quiet" onClick={() => setSimilar(null)}>Edit details</button>
      </div>
    );
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      {field("name", "Name", true)}
      {field("chain", "Chain (optional)")}
      {field("city", "City (optional)")}
      {field("address", "Address (optional)")}
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn primary big" disabled={busy || !form.name.trim()}>
        {busy ? "Creating…" : "Create gym"}
      </button>
    </form>
  );
}
