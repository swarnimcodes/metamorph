// The only module that touches Google Identity Services (GIS). The script is
// loaded lazily, once, and only when a client id is configured.

export const GOOGLE_CLIENT_ID: string | undefined =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() || undefined;

/**
 * The desktop app's own OAuth client, of Google's "Desktop app" type. Google's web sign-in needs a pop-up, which the
 * desktop webview refuses, so the app opens the system browser and catches the redirect on a local port instead
 * (PKCE). For this client type Google's token endpoint still wants the client secret; Google documents that it is
 * not confidential for an installed app, but it is still kept out of git (see .env.example).
 */
export const GOOGLE_DESKTOP_CLIENT_ID: string | undefined =
  (import.meta.env.VITE_GOOGLE_DESKTOP_CLIENT_ID as string | undefined)?.trim() || undefined;
const GOOGLE_DESKTOP_CLIENT_SECRET: string | undefined =
  (import.meta.env.VITE_GOOGLE_DESKTOP_CLIENT_SECRET as string | undefined)?.trim() || undefined;

/** Whether the desktop app has what it needs to offer Google sign-in. */
export const desktopGoogleConfigured = (): boolean => Boolean(GOOGLE_DESKTOP_CLIENT_ID && GOOGLE_DESKTOP_CLIENT_SECRET);

const SRC = "https://accounts.google.com/gsi/client";
let loading: Promise<void> | null = null;

function loadScript(): Promise<void> {
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      s.remove();
      loading = null; // allow a retry
      reject(new Error("Couldn't load Google sign-in"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * Android app: Credential Manager's account picker, via the native plugin. `GOOGLE_CLIENT_ID` is the
 * *web* client id, so the ID token's audience is the one the server already accepts; the Android client
 * (package + signing key) only lets Google verify the app. Resolves with the ID token.
 */
export async function nativeGoogleSignIn(): Promise<string> {
  if (!GOOGLE_CLIENT_ID) throw new Error("Google sign-in isn't configured");
  const { signIn } = await import("@choochmeque/tauri-plugin-google-auth-api");
  const tokens = await signIn({ clientId: GOOGLE_CLIENT_ID, scopes: ["openid", "email", "profile"], flowType: "native" });
  if (!tokens.idToken) throw new Error("Google didn't return an ID token");
  return tokens.idToken;
}

/**
 * Desktop app: Google's own page in the system browser, then back to the app through a loopback redirect. Resolves
 * with the ID token. Its audience is the *desktop* client id, so the server must list that id in GOOGLE_CLIENT_IDS.
 */
export async function desktopGoogleSignIn(): Promise<string> {
  if (!GOOGLE_DESKTOP_CLIENT_ID || !GOOGLE_DESKTOP_CLIENT_SECRET) throw new Error("Google sign-in isn't configured for the desktop app");
  const { signIn } = await import("@choochmeque/tauri-plugin-google-auth-api");
  const tokens = await signIn({
    clientId: GOOGLE_DESKTOP_CLIENT_ID,
    clientSecret: GOOGLE_DESKTOP_CLIENT_SECRET,
    scopes: ["openid", "email", "profile"],
    successHtmlResponse: "<!doctype html><meta charset=utf-8><title>Metamorph</title><body style=\"font-family:system-ui;background:#121316;color:#ecedee;display:grid;place-items:center;height:100vh;margin:0\"><p>Signed in. You can close this tab and return to Metamorph.</p>",
  });
  if (!tokens.idToken) throw new Error("Google didn't return an ID token");
  return tokens.idToken;
}

let onCredential: (idToken: string) => void = () => {};
let initialised = false;

/**
 * Render Google's button into `el`. `cb` receives the ID token (the
 * `credential` field of GIS's CredentialResponse). Resolves once rendered.
 */
export async function renderGoogleButton(el: HTMLElement, cb: (idToken: string) => void, width: number): Promise<void> {
  if (!GOOGLE_CLIENT_ID) return;
  await loadScript();
  onCredential = cb;
  if (!initialised) {
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (r) => {
        if (r.credential) onCredential(r.credential);
      },
    });
    initialised = true;
  }
  el.replaceChildren();
  google.accounts.id.renderButton(el, {
    type: "standard",
    theme: "outline",
    size: "large",
    text: "continue_with",
    shape: "rectangular",
    logo_alignment: "left",
    width: Math.round(Math.min(360, Math.max(200, width))),
  });
}

/** Call on logout so GIS doesn't silently re-sign the user in. Safe if GIS never loaded. */
export function disableGoogleAutoSelect(): void {
  try {
    if (typeof google !== "undefined") google.accounts.id.disableAutoSelect();
  } catch {
    /* GIS not loaded */
  }
}
