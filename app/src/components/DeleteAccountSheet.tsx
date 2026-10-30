import { useState } from "react";
import { matchesUsername } from "../lib/accountDeletion";
import { errMsg, useAuth } from "../stores/auth";
import { Sheet } from "./Sheet";

/** Asks for the username to be typed, then deletes the account for good. */
export function DeleteAccountSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const username = useAuth((s) => s.user?.username);
  const deleteAccount = useAuth((s) => s.deleteAccount);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close(next: boolean) {
    if (busy) return;
    onOpenChange(next);
    if (!next) {
      setTyped("");
      setError(null);
    }
  }

  async function submit() {
    if (!username || !matchesUsername(typed, username) || busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAccount(typed);
      // Signed out: the sign-in screen takes over and shows the confirmation.
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={close} title="Delete account">
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p>
          This permanently deletes your account and everything in it: your workouts, sets, body weight entries and
          settings. It can't be undone.
        </p>
        <p className="dim small">
          Gyms and exercises you added to the shared directory stay, without your name on them.
        </p>
        <label className="field">
          <span>
            Type your username <strong>{username}</strong> to confirm
          </span>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="off"
            aria-label="Type your username to confirm"
          />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn danger big" type="submit" disabled={!matchesUsername(typed, username) || busy}>
          {busy ? "Deleting…" : "Delete my account"}
        </button>
      </form>
    </Sheet>
  );
}
