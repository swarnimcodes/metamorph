import { describe, expect, it } from "vitest";
import { joinUrl, resolveApiBase } from "./client";
import clientSource from "./client.ts?raw";

describe("resolveApiBase", () => {
  it("resolves a relative API path against the page origin", () => {
    expect(resolveApiBase("/api", "https://metamorph.smarniw.com")).toBe("https://metamorph.smarniw.com/api/");
  });

  it("leaves an absolute API address alone", () => {
    expect(resolveApiBase("http://localhost:3000", "http://localhost:1420")).toBe("http://localhost:3000/");
    expect(resolveApiBase("https://example.com/api/", "https://other.example")).toBe("https://example.com/api/");
  });
});

describe("joinUrl", () => {
  const prod = resolveApiBase("/api", "https://metamorph.smarniw.com");

  it("keeps the /api prefix for paths written with a leading slash", () => {
    expect(joinUrl(prod, "/auth/google")).toBe("https://metamorph.smarniw.com/api/auth/google");
    expect(joinUrl(prod, "/workouts/abc/exercises")).toBe("https://metamorph.smarniw.com/api/workouts/abc/exercises");
    expect(joinUrl(prod, "workouts")).toBe("https://metamorph.smarniw.com/api/workouts");
    expect(joinUrl(prod, "//health")).toBe("https://metamorph.smarniw.com/api/health");
  });

  it("is unchanged for the development API at the origin root", () => {
    expect(joinUrl("http://localhost:3000/", "/auth/google")).toBe("http://localhost:3000/auth/google");
  });

  // Regression: the first production deploy sent POST /auth/google (no /api) and got a 405 from the
  // static file server. Check every path literal the real client uses, not a hand-picked one.
  it("keeps the prefix for every path the client actually requests", () => {
    const paths = [...clientSource.matchAll(/[`"'](\/[a-z][A-Za-z0-9_\-/${}.]*)[`"']/g)].map((m) => m[1]);
    expect(paths.length).toBeGreaterThan(15);
    for (const p of paths) {
      const sample = p.replace(/\$\{[^}]*\}/g, "x");
      expect(joinUrl(prod, sample), p).toMatch(/^https:\/\/metamorph\.smarniw\.com\/api\/[a-z]/);
    }
  });
});
