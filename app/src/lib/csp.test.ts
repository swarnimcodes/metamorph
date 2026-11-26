import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, originOf, targetOf } from "./csp";

const directive = (csp: string, name: string): string[] =>
  (csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "").split(" ").slice(1);

describe("contentSecurityPolicy", () => {
  const web = contentSecurityPolicy("web", "/api");
  const android = contentSecurityPolicy("android", "https://metamorph.smarniw.com/api");
  const desktop = contentSecurityPolicy("desktop", "https://metamorph.smarniw.com/api");

  it("never allows inline script or eval, whatever the build", () => {
    for (const csp of [web, android, desktop]) {
      expect(directive(csp, "script-src")).not.toContain("'unsafe-inline'");
      expect(directive(csp, "script-src")).not.toContain("'unsafe-eval'");
      expect(directive(csp, "object-src")).toEqual(["'none'"]);
      expect(directive(csp, "default-src")).toEqual(["'self'"]);
    }
  });

  it("lets the website load Google's sign-in and nothing else from outside", () => {
    expect(directive(web, "script-src")).toEqual(["'self'", "https://accounts.google.com/gsi/client"]);
    expect(directive(web, "frame-src")).toEqual(["https://accounts.google.com/gsi/"]);
    expect(directive(web, "connect-src")).toEqual(["'self'", "https://accounts.google.com/gsi/"]);
  });

  it("keeps the apps off Google's web sign-in, and lets them reach their own API and Tauri's bridge", () => {
    for (const csp of [android, desktop]) {
      expect(directive(csp, "script-src")).toEqual(["'self'"]);
      expect(directive(csp, "frame-src")).toEqual(["'none'"]);
      expect(directive(csp, "connect-src")).toEqual(expect.arrayContaining(["ipc:", "http://ipc.localhost", "https://metamorph.smarniw.com"]));
    }
  });

  it("lets only Android reach Google's token endpoint", () => {
    expect(directive(android, "connect-src")).toContain("https://oauth2.googleapis.com");
    expect(directive(desktop, "connect-src")).not.toContain("https://oauth2.googleapis.com");
    expect(directive(web, "connect-src")).not.toContain("https://oauth2.googleapis.com");
  });

  it("allows profile pictures from Google", () => {
    expect(directive(web, "img-src")).toContain("https://*.googleusercontent.com");
  });
});

describe("helpers", () => {
  it("takes the origin of an absolute API address and none from a path", () => {
    expect(originOf("https://metamorph.smarniw.com/api")).toBe("https://metamorph.smarniw.com");
    expect(originOf("/api")).toBeNull();
    expect(originOf("")).toBeNull();
  });
  it("maps Vite's mode to the build", () => {
    expect(targetOf("desktop")).toBe("desktop");
    expect(targetOf("android")).toBe("android");
    expect(targetOf("production")).toBe("web");
  });
});
