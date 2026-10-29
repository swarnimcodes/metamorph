import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { SavedGym, UnitSystem } from "../api/types";
import { toastError } from "../lib/toast";
import { errMsg, useAuth } from "../stores/auth";

const UNITS: { value: UnitSystem; label: string }[] = [
  { value: "metric", label: "kg" },
  { value: "imperial", label: "lb" },
];

export function You() {
  const user = useAuth((s) => s.user);
  const updateProfile = useAuth((s) => s.updateProfile);
  const logout = useAuth((s) => s.logout);
  const [busy, setBusy] = useState(false);
  const [gyms, setGyms] = useState<SavedGym[] | null>(null);

  useEffect(() => {
    api.myGyms().then(setGyms, (e) => toastError(`Couldn't load your gyms: ${errMsg(e)}`));
  }, []);

  async function makeDefault(g: SavedGym) {
    try {
      await api.setDefaultGym(g.id);
      setGyms((all) => all && all.map((x) => ({ ...x, is_default: x.id === g.id })));
    } catch (e) {
      toastError(`Couldn't set default: ${errMsg(e)}`);
    }
  }

  async function choose(next: UnitSystem) {
    if (!user || next === user.unit_system) return;
    setBusy(true);
    try {
      await updateProfile({ unit_system: next });
    } catch (e) {
      toastError(`Couldn't change units: ${errMsg(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="screen">
      <header className="stack-sm">
        <h1>You</h1>
        <p className="dim">{user?.display_name}{user?.username && ` · @${user.username}`}</p>
      </header>
      <section className="card stack" aria-label="Units">
        <h2>Weight units</h2>
        <ToggleGroup
          className="type-group"
          value={[user?.unit_system ?? "metric"]}
          onValueChange={(v) => v[0] && void choose(v[0] as UnitSystem)}
          disabled={busy}
          aria-label="Weight units"
        >
          {UNITS.map((u) => (
            <Toggle key={u.value} value={u.value} className="type-opt">
              {u.label}
            </Toggle>
          ))}
        </ToggleGroup>
        <p className="dim small">Weights are stored in kg and converted for display.</p>
      </section>

      <section className="stack" aria-labelledby="gyms-h">
        <h2 id="gyms-h">Your gyms</h2>
        {gyms && gyms.length === 0 && <p className="dim">Gyms you add to a workout show up here.</p>}
        {gyms && gyms.length > 0 && (
          <ul className="rows card">
            {gyms.map((g) => (
              <li key={g.id} className="gym-row">
                <span className="card-title">
                  {g.name}
                  {g.city && <span className="dim"> · {g.city}</span>}
                </span>
                {g.is_default ? (
                  <span className="dim small">Default</span>
                ) : (
                  <button className="btn quiet small-btn" onClick={() => void makeDefault(g)}>Make default</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <button className="btn danger-text" onClick={logout}>Log out</button>
    </main>
  );
}
