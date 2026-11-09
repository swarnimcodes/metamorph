/** True inside the Tauri shell (desktop or mobile), false in a plain browser. */
export const isTauri = (): boolean => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** The desktop app (Linux, macOS, Windows): the Tauri shell on anything but Android. Its webview cannot open Google's
 *  sign-in pop-up, so it signs in through the system browser. */
export const isDesktopApp = (): boolean => isTauri() && !/Android/i.test(navigator.userAgent);

/** The Android app: Google's web sign-in can't run in its WebView, so it signs in natively. */
export const isAndroidApp = (): boolean => isTauri() && /Android/i.test(navigator.userAgent);
