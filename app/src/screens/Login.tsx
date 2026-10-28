import { useState, type FormEvent } from "react";
import { useAuth, errMsg } from "../stores/auth";

const DEV_LOGIN = import.meta.env.DEV || import.meta.env.VITE_DEV_LOGIN === "true";

export function Login() {
  const devLogin = useAuth((s) => s.devLogin);
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await devLogin(username);
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  }

  return (
    <main className="screen center">
      <h1 className="brand">Metamorph</h1>
      <p className="dim">Log your lifts. Keep it simple.</p>

      {/* A "Sign in with Google" button goes here and ends in useAuth().completeLogin(response). */}

      {DEV_LOGIN ? (
        <form className="stack" onSubmit={submit}>
          <label className="field">
            <span>Username (dev login)</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username"
              autoFocus
              required
            />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn primary big" disabled={busy || !username.trim()}>
            {busy ? "Signing in…" : "Continue"}
          </button>
        </form>
      ) : (
        <p className="dim">No sign-in method is available in this build.</p>
      )}
    </main>
  );
}
