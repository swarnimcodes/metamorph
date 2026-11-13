import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const REDIRECT = "com.smarniw.metamorph:/oauth2redirect";

async function load() {
  vi.resetModules();
  vi.stubEnv("VITE_GOOGLE_ANDROID_CLIENT_ID", "android-client");
  const open = vi.fn().mockResolvedValue(undefined);
  let handler: ((urls: string[]) => void) | undefined;
  vi.doMock("@tauri-apps/plugin-opener", () => ({ openUrl: open }));
  vi.doMock("@tauri-apps/plugin-deep-link", () => ({
    onOpenUrl: async (h: (urls: string[]) => void) => {
      handler = h;
      return () => undefined;
    },
    getCurrent: async () => null,
  }));
  const mod = await import("./google");
  return { mod, open, redirect: (q: string) => handler?.([`${REDIRECT}?${q}`]) };
}

describe("android browser sign-in", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.doUnmock("@tauri-apps/plugin-opener");
    vi.doUnmock("@tauri-apps/plugin-deep-link");
  });

  it("opens Google with PKCE, then trades the code for an ID token", async () => {
    const { mod, open, redirect } = await load();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id_token: "the.id.token" }) });
    vi.stubGlobal("fetch", fetchMock);

    const pending = mod.androidBrowserGoogleSignIn();
    await vi.waitFor(() => expect(open).toHaveBeenCalled());
    const url = new URL(open.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("android-client");
    expect(url.searchParams.get("redirect_uri")).toBe(REDIRECT);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");

    redirect(`code=abc&state=${url.searchParams.get("state")}`);
    await expect(pending).resolves.toBe("the.id.token");
    const sent = fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(sent.get("code")).toBe("abc");
    expect(sent.get("grant_type")).toBe("authorization_code");
    expect(sent.get("code_verifier")).toBeTruthy();
    expect(sent.has("client_secret")).toBe(false);
    expect(localStorage.getItem("metamorph.oauth.pending")).toBeNull();
  });

  it("ignores a redirect whose state is not ours", async () => {
    const { mod, open, redirect } = await load();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const pending = mod.androidBrowserGoogleSignIn();
    pending.catch(() => undefined);
    await vi.waitFor(() => expect(open).toHaveBeenCalled());
    redirect("code=abc&state=someone-else");
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a cancelled sign-in", async () => {
    const { mod, open, redirect } = await load();
    const pending = mod.androidBrowserGoogleSignIn();
    await vi.waitFor(() => expect(open).toHaveBeenCalled());
    const state = new URL(open.mock.calls[0][0] as string).searchParams.get("state");
    redirect(`error=access_denied&state=${state}`);
    await expect(pending).rejects.toThrow(/cancel/i);
  });
});
