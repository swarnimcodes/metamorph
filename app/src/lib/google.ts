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

/**
 * The Android app's OAuth client, of Google's "Android" type, used for the browser sign-in. Phones without Google Play
 * services (GrapheneOS and other de-Googled systems) can't run the account picker above, so the app opens the system
 * browser instead and Google sends it back through the custom-scheme redirect below (PKCE, no client secret). The
 * client must have "Enable custom URI scheme" switched on, and the server must list its id in GOOGLE_CLIENT_IDS.
 */
export const GOOGLE_ANDROID_CLIENT_ID: string | undefined =
  (import.meta.env.VITE_GOOGLE_ANDROID_CLIENT_ID as string | undefined)?.trim() || undefined;
export const androidBrowserGoogleConfigured = (): boolean => Boolean(GOOGLE_ANDROID_CLIENT_ID);

const ANDROID_REDIRECT = "com.smarniw.metamorph:/oauth2redirect";
const PENDING_KEY = "metamorph.oauth.pending";
const PENDING_MAX_AGE_MS = 10 * 60_000;

interface Pending {
  verifier: string;
  state: string;
  at: number;
}

const b64url = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const randomString = (n: number): string => b64url(crypto.getRandomValues(new Uint8Array(n)));

// The pending sign-in lives in storage, not memory: a phone short of RAM may kill the app while the browser is in front.
function savePending(p: Pending): void {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(p));
  } catch {
    /* without storage the sign-in still works while the app stays alive: it is also held in memory */
  }
  memoryPending = p;
}
let memoryPending: Pending | null = null;
function loadPending(): Pending | null {
  let p = memoryPending;
  if (!p) {
    try {
      const raw = localStorage.getItem(PENDING_KEY);
      if (raw) p = JSON.parse(raw) as Pending;
    } catch {
      /* corrupt or unavailable */
    }
  }
  return p && Date.now() - p.at < PENDING_MAX_AGE_MS ? p : null;
}
function clearPending(): void {
  memoryPending = null;
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* nothing to clear */
  }
}

/** Turns the redirect back into an ID token: checks `state`, then exchanges the code (PKCE, no secret). Null if this URL isn't ours. */
async function finishAndroidBrowserSignIn(url: string): Promise<string | null> {
  if (!url.startsWith(ANDROID_REDIRECT) || !GOOGLE_ANDROID_CLIENT_ID) return null;
  const pending = loadPending();
  if (!pending) return null;
  const q = new URL(url).searchParams;
  if (q.get("state") !== pending.state) return null;
  clearPending();
  const err = q.get("error");
  if (err) throw new Error(err === "access_denied" ? "Sign-in cancelled" : `Google sign-in failed (${err})`);
  const code = q.get("code");
  if (!code) throw new Error("Google didn't return a sign-in code");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_ANDROID_CLIENT_ID,
      code,
      code_verifier: pending.verifier,
      redirect_uri: ANDROID_REDIRECT,
      grant_type: "authorization_code",
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { id_token?: string; error_description?: string };
  if (!res.ok || !body.id_token) throw new Error(body.error_description || "Google didn't return an ID token");
  return body.id_token;
}

/**
 * Android app, no Google Play services needed: Google's page in the system browser, then back to the app through the
 * custom-scheme redirect. Resolves with the ID token, whose audience is the *Android* client id.
 */
export async function androidBrowserGoogleSignIn(): Promise<string> {
  if (!GOOGLE_ANDROID_CLIENT_ID) throw new Error("Browser sign-in isn't configured");
  const { onOpenUrl } = await import("@tauri-apps/plugin-deep-link");
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  const verifier = randomString(48);
  const state = randomString(16);
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  savePending({ verifier, state, at: Date.now() });

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: GOOGLE_ANDROID_CLIENT_ID,
    redirect_uri: ANDROID_REDIRECT,
    response_type: "code",
    scope: "openid email profile",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    prompt: "select_account",
  }).toString();

  return new Promise<string>((resolve, reject) => {
    let done = false;
    let unlisten: (() => void) | undefined;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      unlisten?.();
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => finish(() => reject(new Error("Sign-in timed out"))), PENDING_MAX_AGE_MS);
    void onOpenUrl((urls) => {
      for (const u of urls) {
        finishAndroidBrowserSignIn(u).then(
          (t) => t && finish(() => resolve(t)),
          (e) => finish(() => reject(e)),
        );
      }
    }).then((u) => (done ? u() : (unlisten = u)));
    openUrl(url.toString()).catch((e) => finish(() => reject(e)));
  });
}

/**
 * The app was started by the redirect (the system closed it while the browser was open): finish that sign-in. Resolves
 * with the ID token, or null when the app wasn't opened that way.
 */
export async function resumeAndroidBrowserSignIn(): Promise<string | null> {
  if (!GOOGLE_ANDROID_CLIENT_ID) return null;
  const { getCurrent } = await import("@tauri-apps/plugin-deep-link");
  for (const u of (await getCurrent()) ?? []) {
    const t = await finishAndroidBrowserSignIn(u);
    if (t) return t;
  }
  return null;
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
