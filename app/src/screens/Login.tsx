import { useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { GoogleSignupRequired } from "../api/types";
import { GoogleButton } from "../components/GoogleButton";
import { LogoMark } from "../components/LogoMark";
import { GOOGLE_CLIENT_ID } from "../lib/google";
import { needsSignup } from "../lib/signup";
import { useAuth, errMsg } from "../stores/auth";
import { ChooseUsername } from "./ChooseUsername";

// Opt-in only: dev login never shows up just because this is a dev build.
const DEV_LOGIN = import.meta.env.VITE_DEV_LOGIN === "true";

export function Login() {
  const devLogin = useAuth((s) => s.devLogin);
  const completeLogin = useAuth((s) => s.completeLogin);
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const notice = useAuth((s) => s.notice);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [signup, setSignup] = useState<GoogleSignupRequired | null>(null);

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

  async function onGoogleCredential(idToken: string) {
    setGoogleBusy(true);
    setGoogleError(null);
    try {
      const r = await api.googleLogin(idToken);
      if (needsSignup(r)) setSignup(r);
      else await completeLogin(r);
    } catch (err) {
      setGoogleError(errMsg(err));
    } finally {
      setGoogleBusy(false);
    }
  }

  if (signup) {
    return (
      <ChooseUsername
        info={signup}
        onCancel={(message) => {
          setSignup(null);
          setGoogleError(message ?? null);
        }}
      />
    );
  }

  return (
    <main className="screen center login">
      <div className="login-inner">
        <LogoMark />
        <div className="login-copy">
          <h1 className="brand">Metamorph</h1>
          <p className="dim">Log your lifts. Keep it simple.</p>
        </div>

        {notice && <p className="dim" role="status">{notice}</p>}
        <GoogleButton onCredential={(t) => void onGoogleCredential(t)} disabled={googleBusy} />
        {googleBusy && <p className="dim" role="status">Signing in…</p>}
        {googleError && <p className="error" role="alert">{googleError}</p>}

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
              autoFocus={!GOOGLE_CLIENT_ID}
              required
            />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn primary big" disabled={busy || !username.trim()}>
            {busy ? "Signing in…" : "Continue"}
          </button>
        </form>
      ) : (
        !GOOGLE_CLIENT_ID && <p className="dim">No sign-in method is available in this build.</p>
      )}
      </div>
    </main>
  );
}
