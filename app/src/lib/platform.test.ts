import { afterEach, describe, expect, it, vi } from "vitest";
import { isAndroidApp, isDesktopApp, isTauri } from "./platform";

function env(opts: { tauri: boolean; ua: string }) {
  vi.stubGlobal("window", opts.tauri ? { __TAURI_INTERNALS__: {} } : {});
  vi.stubGlobal("navigator", { userAgent: opts.ua });
}

afterEach(() => vi.unstubAllGlobals());

const ANDROID = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36";
const LINUX = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 Version/17 Safari/605.1.15";

describe("platform detection", () => {
  it("a plain browser is neither the Android nor the desktop app", () => {
    env({ tauri: false, ua: LINUX });
    expect([isTauri(), isAndroidApp(), isDesktopApp()]).toEqual([false, false, false]);
    env({ tauri: false, ua: ANDROID });
    expect([isTauri(), isAndroidApp(), isDesktopApp()]).toEqual([false, false, false]);
  });

  it("the Tauri shell on Android is the Android app only", () => {
    env({ tauri: true, ua: ANDROID });
    expect([isTauri(), isAndroidApp(), isDesktopApp()]).toEqual([true, true, false]);
  });

  it("the Tauri shell anywhere else is the desktop app only", () => {
    env({ tauri: true, ua: LINUX });
    expect([isTauri(), isAndroidApp(), isDesktopApp()]).toEqual([true, false, true]);
  });
});
