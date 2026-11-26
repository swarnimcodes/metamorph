/**
 * The Content-Security-Policy put into index.html when the app is built (see vite.config.ts). It tells the browser
 * what the page may load, so a script injected through a bug could neither run from an outside address nor send the
 * sign-in token to one. Development builds get none: the dev server needs eval and a websocket.
 *
 * It is a <meta> tag rather than a server header on purpose: the same file is then enforced on the website, in the
 * desktop app and in Android's WebView, and shipping it needs no change on the server.
 */
export type Target = "web" | "desktop" | "android";

/** The part of an API address that goes in connect-src: nothing for a path on the same site ("/api"). */
export function originOf(apiUrl: string): string | null {
  try {
    return new URL(apiUrl).origin;
  } catch {
    return null;
  }
}

const GOOGLE_SIGN_IN = "https://accounts.google.com/gsi/";

export function contentSecurityPolicy(target: Target, apiUrl: string): string {
  const api = originOf(apiUrl);
  const web = target === "web";
  const connect = [
    "'self'",
    // Tauri's bridge between the page and the app.
    ...(web ? [] : ["ipc:", "http://ipc.localhost"]),
    ...(api ? [api] : []),
    // The website's Google sign-in talks to Google; Android swaps its sign-in code for a token at Google directly.
    ...(web ? [GOOGLE_SIGN_IN] : []),
    ...(target === "android" ? ["https://oauth2.googleapis.com"] : []),
  ];
  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    // No inline script and no eval. Google's sign-in script is the only outside one, and only on the website.
    ["script-src", ["'self'", ...(web ? [`${GOOGLE_SIGN_IN}client`] : [])]],
    // Components set sizes and positions with style attributes, which needs 'unsafe-inline' for styles (not scripts).
    ["style-src", ["'self'", "'unsafe-inline'", ...(web ? [`${GOOGLE_SIGN_IN}style`] : [])]],
    // Profile pictures come from Google.
    ["img-src", ["'self'", "data:", "https://*.googleusercontent.com"]],
    ["font-src", ["'self'", "data:"]],
    ["connect-src", connect],
    ["frame-src", web ? [GOOGLE_SIGN_IN] : ["'none'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
  ];
  return directives.map(([name, values]) => `${name} ${values.join(" ")}`).join("; ");
}

/** Which build this is, from Vite's mode: `--mode desktop` and `--mode android` come from the Tauri configs. */
export function targetOf(mode: string): Target {
  return mode === "desktop" || mode === "android" ? mode : "web";
}
