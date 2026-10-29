import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api/client";
import type { Gym, NewGym } from "../api/types";
import { gymLine } from "../lib/gyms";
import { gymChanged } from "../lib/invalidate";
import { errMsg } from "../stores/auth";

export function CreateGym({ initialName, onCreated }: { initialName: string; onCreated: (g: Gym) => void }) {
  const [form, setForm] = useState({ name: initialName, chain: "", area: "", city: "", address: "", maps_url: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [similar, setSimilar] = useState<Gym[] | null>(null);

  async function create(force: boolean) {
    const body: NewGym = { name: form.name.trim() };
    if (form.chain.trim()) body.chain = form.chain.trim();
    if (form.area.trim()) body.area = form.area.trim();
    if (form.city.trim()) body.city = form.city.trim();
    if (form.maps_url.trim()) body.maps_url = form.maps_url.trim();
    if (form.address.trim()) body.address = form.address.trim();
    if (force) body.force = true;
    setBusy(true);
    setError(null);
    try {
      const gym = await api.createGym(body);
      void gymChanged();
      onCreated(gym);
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
      {field("area", "Area (optional)")}
      {field("city", "City (optional)")}
      {field("address", "Address (optional)")}
      <label className="field">
        <span>Google Maps link (optional)</span>
        <input type="url" inputMode="url" placeholder="https://maps.app.goo.gl/…" value={form.maps_url} onChange={(e) => setForm({ ...form, maps_url: e.target.value })} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn primary big" disabled={busy || !form.name.trim()}>
        {busy ? "Creating…" : "Create gym"}
      </button>
    </form>
  );
}
