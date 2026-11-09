import { useEffect, useRef, useState } from "react";

/** How long the desktop app waits before offering to start the browser step again. */
const BROWSER_SLOW_MS = 12_000;
import { errMsg } from "../stores/auth";
import { desktopGoogleConfigured, desktopGoogleSignIn, GOOGLE_CLIENT_ID, nativeGoogleSignIn, renderGoogleButton } from "../lib/google";
import { isAndroidApp, isDesktopApp } from "../lib/platform";

/** Google's "G" mark, unmodified colours. */
function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/**
 * Outlined "Continue with Google" button. The visible button is ours; Google's real
 * button is rendered invisibly over it and receives the click. Renders nothing (and
 * loads no script) without a client id.
 */
export function GoogleButton({ onCredential, disabled }: { onCredential: (idToken: string) => void; disabled?: boolean }) {
  if (GOOGLE_CLIENT_ID && isAndroidApp()) return <NativeGoogleButton signIn={nativeGoogleSignIn} onCredential={onCredential} disabled={disabled} />;
  // The desktop webview cannot open Google's pop-up, so the web button would fail: use the system browser, or show
  // nothing when the desktop client is not configured.
  if (isDesktopApp()) {
    return desktopGoogleConfigured() ? <NativeGoogleButton signIn={desktopGoogleSignIn} inBrowser onCredential={onCredential} disabled={disabled} /> : null;
  }
  return <WebGoogleButton onCredential={onCredential} disabled={disabled} />;
}

/** Android and desktop have no usable GIS: our own face, and a tap opens the system account picker (Android) or the browser (desktop). */
function NativeGoogleButton({
  signIn,
  onCredential,
  disabled,
  inBrowser,
}: {
  signIn: () => Promise<string>;
  onCredential: (idToken: string) => void;
  disabled?: boolean;
  /** The sign-in continues in the user's browser (desktop): say so, and offer a way out if it never finishes. */
  inBrowser?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [slow, setSlow] = useState(false);
  // Only the latest attempt may change the screen: an abandoned one (a closed browser tab) must not.
  const attempt = useRef(0);

  useEffect(() => {
    if (!picking || !inBrowser) return;
    const t = setTimeout(() => setSlow(true), BROWSER_SLOW_MS);
    return () => clearTimeout(t);
  }, [picking, inBrowser]);

  async function pick() {
    const mine = ++attempt.current;
    setPicking(true);
    setSlow(false);
    setError(null);
    try {
      const token = await signIn();
      if (mine === attempt.current) onCredential(token);
    } catch (e) {
      // Closing the account picker is not worth an error.
      const msg = errMsg(e);
      if (mine === attempt.current && !/cancel/i.test(msg)) setError(msg);
    } finally {
      if (mine === attempt.current) setPicking(false);
    }
  }

  return (
    <div className="google-wrap" aria-busy={disabled || picking || undefined}>
      <div className={disabled || picking ? "google-slot is-busy" : "google-slot"}>
        <button type="button" className="google-face google-native" onClick={() => void pick()} disabled={disabled || picking}>
          <GoogleG />
          <span>{picking && inBrowser ? "Waiting for your browser…" : "Continue with Google"}</span>
        </button>
      </div>
      {picking && inBrowser && (
        <div className="google-hint" role="status">
          <p>
            <strong>Continue in your browser.</strong> We've opened Google's sign-in page there. Choose your
            account, then come back to this window.
          </p>
          {slow && (
            <p>
              Nothing opened, or you closed it?{" "}
              <button type="button" className="link" onClick={() => void pick()}>
                Open it again
              </button>
            </p>
          )}
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

function WebGoogleButton({ onCredential, disabled }: { onCredential: (idToken: string) => void; disabled?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const cb = useRef(onCredential);
  cb.current = onCredential;
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!GOOGLE_CLIENT_ID || !el) return;
    let live = true;
    renderGoogleButton(el, (t) => cb.current(t), el.clientWidth).catch((e) => {
      if (live) setLoadError(errMsg(e));
    });
    return () => {
      live = false;
    };
  }, [loadError === null]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!GOOGLE_CLIENT_ID) return null;
  return (
    <div className="google-wrap" aria-busy={disabled || undefined}>
      <div className={disabled ? "google-slot is-busy" : "google-slot"}>
        <div className="google-face" aria-hidden="true">
          <GoogleG />
          <span>Continue with Google</span>
        </div>
        <div ref={host} className="google-overlay" />
      </div>
      {loadError && (
        <div className="stack-sm">
          <p className="error" role="alert">{loadError}. Check your connection and try again.</p>
          <button type="button" className="btn" onClick={() => setLoadError(null)}>Retry</button>
        </div>
      )}
    </div>
  );
}
