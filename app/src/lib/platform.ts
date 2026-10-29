/** True inside the Tauri shell (desktop or mobile), false in a plain browser. */
export const isTauri = (): boolean => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** The Android app: Google's web sign-in can't run in its WebView, so it signs in natively. */
export const isAndroidApp = (): boolean => isTauri() && /Android/i.test(navigator.userAgent);
