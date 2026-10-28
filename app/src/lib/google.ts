// The only module that touches Google Identity Services (GIS). The script is
// loaded lazily, once, and only when a client id is configured.

export const GOOGLE_CLIENT_ID: string | undefined =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() || undefined;

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
