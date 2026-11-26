import { useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { Gym } from "../api/types";
import { gymEdited } from "../lib/invalidate";
import { errMsg } from "../stores/auth";
import { formDiff, GymForm, gymToForm } from "./GymForm";

/** Edit a saved gym. Saves only what changed; the server keeps a record of it. */
export function EditGym({ gym, onSaved }: { gym: Gym; onSaved: () => void }) {
  const [before] = useState(() => gymToForm(gym));
  const [form, setForm] = useState(before);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const diff = formDiff(before, form);
  const changed = Object.keys(diff).length > 0;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!changed || !form.name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateGym(gym.id, diff);
      await gymEdited();
      onSaved();
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={save}>
      <GymForm value={form} onChange={setForm} />
      <p className="dim small">Gyms are shared with everyone. Changes are recorded on the gym's page.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn primary big" disabled={busy || !changed || !form.name.trim()}>
        {busy ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
