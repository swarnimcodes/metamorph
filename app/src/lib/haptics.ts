import { isAndroidApp } from "./platform";

/**
 * Short physical feedback: a light tick for an everyday action, a double pulse for something finished, a harder
 * buzz for a problem. In the Android app it goes through the Tauri haptics plugin; in a phone's browser through the
 * Vibration API; on a computer it does nothing. People can switch it off in You.
 */
export type Haptic = "tap" | "success" | "error";

const KEY = "metamorph.haptics";
const MIN_GAP_MS = 40;

/** Vibration Pattern for the browser (milliseconds on, off, on…). */
export function webPattern(kind: Haptic): number | number[] {
  switch (kind) {
    case "tap":
      return 10;
    case "success":
      return [12, 40, 18];
    default:
      return [30, 50, 30];
  }
}

/** Whether this device can give feedback at all: the Android app, or a touch browser that can vibrate. */
export function hapticsAvailable(): boolean {
  if (typeof window === "undefined") return false;
  if (isAndroidApp()) return true;
  return typeof navigator.vibrate === "function" && (window.matchMedia?.("(pointer: coarse)").matches ?? false);
}

/** Parse what is stored: anything but an explicit "off" means on. */
export function parseEnabled(stored: string | null): boolean {
  return stored !== "off";
}

export function hapticsEnabled(): boolean {
  try {
    return parseEnabled(localStorage.getItem(KEY));
  } catch {
    return true;
  }
}

export function setHapticsEnabled(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* the choice just lasts until the page closes */
  }
}

let last = 0;

/** Give feedback. Never throws, never waits, and never fires twice within a few milliseconds. */
export function haptic(kind: Haptic): void {
  if (!hapticsAvailable() || !hapticsEnabled()) return;
  const now = Date.now();
  if (now - last < MIN_GAP_MS) return;
  last = now;
  if (isAndroidApp()) {
    void import("@tauri-apps/plugin-haptics")
      .then((h) => (kind === "tap" ? h.impactFeedback("light") : h.notificationFeedback(kind === "success" ? "success" : "error")))
      .catch(() => undefined);
    return;
  }
  try {
    navigator.vibrate(webPattern(kind));
  } catch {
    /* some browsers refuse without a recent tap; feedback is optional */
  }
}
