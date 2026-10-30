import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { useState } from "react";
import { DeleteAccountSheet } from "../components/DeleteAccountSheet";
import { ExternalLink } from "../components/ExternalLink";
import { BUILD_LABEL } from "../lib/build";
import { PRIVACY_URL } from "../lib/links";
import type { UnitSystem } from "../api/types";
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
  const [deleting, setDeleting] = useState(false);

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

      <button className="btn danger-text" onClick={logout}>Log out</button>

      <section className="stack danger-zone" aria-labelledby="delete-h">
        <h2 id="delete-h">Delete account</h2>
        <p className="dim small">Permanently removes your account and all of your data.</p>
        <button className="btn danger-text" onClick={() => setDeleting(true)}>Delete my account…</button>
      </section>
      <DeleteAccountSheet open={deleting} onOpenChange={setDeleting} />

      <p className="dim small legal">
        <ExternalLink href={PRIVACY_URL}>Privacy policy</ExternalLink>
      </p>
      <p className="dim small build-info">Metamorph {BUILD_LABEL}</p>
    </main>
  );
}
