import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { GoogleSignupRequired, UsernameAvailability } from "../api/types";
import { describeSignupError, EXPIRED_MESSAGE, usernameReasonMessage, type SignupFailure } from "../lib/signup";
import { isValidUsername, normalizeUsername, USERNAME_RULES } from "../lib/username";
import { useAuth, errMsg } from "../stores/auth";

type Check =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "done"; username: string; result: UsernameAvailability }
  | { state: "failed" };

export function ChooseUsername({ info, onCancel }: { info: GoogleSignupRequired; onCancel: (message?: string) => void }) {
  const completeLogin = useAuth((s) => s.completeLogin);
  const [username, setUsername] = useState(normalizeUsername(info.suggested_username));
  const [displayName, setDisplayName] = useState(info.display_name);
  const [check, setCheck] = useState<Check>({ state: "idle" });
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<{ username: string; message: string } | null>(null);
  const [failure, setFailure] = useState<SignupFailure | null>(null);

  const valid = isValidUsername(username);

  // Debounced availability check; a cleanup flag drops stale responses.
  useEffect(() => {
    if (!valid) {
      setCheck({ state: "idle" });
      return;
    }
    setCheck({ state: "checking" });
    let stale = false;
    const t = setTimeout(() => {
      api.usernameAvailable(username).then(
        (result) => !stale && setCheck({ state: "done", username, result }),
        () => !stale && setCheck({ state: "failed" }),
      );
    }, 300);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [username, valid]);

  const taken = check.state === "done" && !check.result.available;
  const serverField = fieldError?.username === username ? fieldError.message : null;
  const canSubmit = valid && displayName.trim() !== "" && !busy && !taken && !serverField;

  let status: { text: string; tone: "dim" | "ok" | "bad" } | null = null;
  if (serverField) status = { text: serverField, tone: "bad" };
  else if (username && !valid) status = { text: "Not valid yet. " + USERNAME_RULES, tone: "bad" };
  else if (check.state === "checking") status = { text: "Checking…", tone: "dim" };
  else if (check.state === "done")
    status = check.result.available
      ? { text: "Available", tone: "ok" }
      : { text: usernameReasonMessage(check.result.reason), tone: "bad" };
  else if (check.state === "failed") status = { text: "Couldn't check right now. You can still try.", tone: "dim" };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setFailure(null);
    let r;
    try {
      r = await api.googleSignup({ signup_token: info.signup_token, username, display_name: displayName.trim() });
    } catch (err) {
      const f = describeSignupError(err);
      if (f.kind === "expired") return onCancel(EXPIRED_MESSAGE);
      if (f.kind === "field") setFieldError({ username, message: f.message });
      else setFailure(f);
      setBusy(false);
      return;
    }
    try {
      await completeLogin(r);
    } catch (err) {
      setFailure({ kind: "other", message: errMsg(err) });
      setBusy(false);
    }
  }

  if (failure?.kind === "blocked") {
    return (
      <main className="screen center">
        <h1>Can't create the account</h1>
        <p className="error" role="alert">{failure.message}</p>
        <button className="btn primary big" onClick={() => onCancel()}>Back to sign in</button>
      </main>
    );
  }

  return (
    <main className="screen center">
      <form className="stack" onSubmit={submit} noValidate>
        <div className="stack-sm">
          <h1>Choose your username</h1>
          <p className="dim">Friends will find you by this name.</p>
        </div>

        <div className="identity">
          {info.avatar_url && <img src={info.avatar_url} alt="" width={40} height={40} referrerPolicy="no-referrer" />}
          <div>
            <div className="card-title">{info.display_name}</div>
            <div className="dim small">{info.email}</div>
          </div>
        </div>

        <label className="field">
          <span>Username</span>
          <input
            value={username}
            onChange={(e) => setUsername(normalizeUsername(e.target.value))}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="off"
            maxLength={30}
            aria-describedby="username-status username-rules"
            aria-invalid={status?.tone === "bad" || undefined}
          />
        </label>
        <p id="username-rules" className="dim small">{USERNAME_RULES}</p>
        <p id="username-status" className={`small status ${status?.tone ?? ""}`} role="status" aria-live="polite">
          {status?.text ?? " "}
        </p>

        <label className="field">
          <span>Display name</span>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" maxLength={60} />
        </label>

        {failure && <p className="error" role="alert">{failure.message}</p>}
        <button className="btn primary big" disabled={!canSubmit}>{busy ? "Creating…" : "Create account"}</button>
        <button type="button" className="btn quiet" onClick={() => onCancel()} disabled={busy}>Cancel</button>
      </form>
    </main>
  );
}
