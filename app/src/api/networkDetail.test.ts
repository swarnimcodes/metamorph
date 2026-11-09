import { afterEach, describe, expect, it, vi } from "vitest";
import { networkDetail } from "./client";

afterEach(() => vi.unstubAllGlobals());

describe("networkDetail", () => {
  it("adds nothing on the website", () => {
    vi.stubGlobal("window", {});
    expect(networkDetail(new TypeError("Load failed"))).toBe("");
  });

  it("names the server and the engine's reason inside the installed apps", () => {
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    expect(networkDetail(new TypeError("Load failed"))).toMatch(/^ \(.+: Load failed\)$/);
  });

  it("copes with a thrown value that is not an Error", () => {
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    expect(networkDetail("boom")).toMatch(/: boom\)$/);
  });
});
