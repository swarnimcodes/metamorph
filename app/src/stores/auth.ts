import { create } from "zustand";
import { api, ApiError, setSessionExpiredHandler, storeLogin } from "../api/client";
import { clearSession, loadSession } from "../api/tokenStorage";
import { disableGoogleAutoSelect } from "../lib/google";
import { clearAll } from "../lib/invalidate";
import { deviceTimeZone, zoneNeedsSync } from "../lib/timezone";
import type { LoginResponse, Me, MeUpdate } from "../api/types";

type Status = "loading" | "signed-out" | "signed-in" | "unreachable";

interface AuthState {
  status: Status;
  user: Me | null;
  error: string | null;
  /** A one-off message for the sign-in screen, e.g. after the account was deleted. */
  notice: string | null;
  /** Resume a stored session on app start. */
  init: () => Promise<void>;
  /** Shared tail of every sign-in method: persist tokens, then load the profile. */
  completeLogin: (r: LoginResponse) => Promise<void>;
  /** Dev-only username login. Google sign-in calls completeLogin() with its own response. */
  devLogin: (username: string) => Promise<void>;
  logout: () => void;
  /**
   * Make the profile's zone the device's, if it has fallen behind (a new account starts as UTC; a
   * traveller lands somewhere else). The profile zone only decides what "today" and "this week" mean:
   * every workout keeps the zone it was done in, so nothing already logged changes day.
   */
  syncTimeZone: () => Promise<void>;
  /** Deletes the account for good, then signs out. Throws if the server refuses (e.g. wrong username). */
  deleteAccount: (confirmUsername: string) => Promise<void>;
  /** PATCH /me; the returned profile replaces the stored user so every screen re-renders. */
  updateProfile: (patch: MeUpdate) => Promise<void>;
}

/** The profile with its zone brought up to the device's. A failed update leaves it as it was: not worth failing a sign-in over. */
async function alignZone(user: Me): Promise<Me> {
  const zone = deviceTimeZone();
  if (!zoneNeedsSync(user.timezone, zone)) return user;
  try {
    return await api.updateMe({ timezone: zone });
  } catch {
    return user;
  }
}

export const useAuth = create<AuthState>((set, get) => ({
  status: "loading",
  user: null,
  error: null,
  notice: null,

  init: async () => {
    if (!loadSession()) return set({ status: "signed-out" });
    try {
      set({ status: "signed-in", user: await alignZone(await api.me()), error: null });
    } catch (e) {
      // A 401 already triggered logout via the session-expired handler.
      if (e instanceof ApiError && e.status === 0) set({ status: "unreachable", error: e.message });
      else if (get().status !== "signed-out") set({ status: "unreachable", error: errMsg(e) });
    }
  },

  completeLogin: async (r) => {
    clearAll(); // whoever was here before, none of their data is shown to this account
    storeLogin(r);
    set({ user: await alignZone(await api.me()), status: "signed-in", error: null, notice: null });
  },

  devLogin: async (username) => {
    await get().completeLogin(await api.devLogin(username.trim()));
  },

  logout: () => {
    disableGoogleAutoSelect();
    clearSession();
    clearAll();
    set({ status: "signed-out", user: null });
  },

  syncTimeZone: async () => {
    const user = get().user;
    if (get().status !== "signed-in" || !user) return;
    const next = await alignZone(user);
    if (next !== user && get().user?.id === user.id) set({ user: next });
  },

  deleteAccount: async (confirmUsername) => {
    await api.deleteAccount(confirmUsername);
    get().logout();
    set({ notice: "Your account and all its data were deleted." });
  },

  updateProfile: async (patch) => {
    set({ user: await api.updateMe(patch) });
  },
}));

setSessionExpiredHandler(() => useAuth.getState().logout());

/** Tauri plugins reject with a plain string, not an Error, so strings are shown as they are. */
export const errMsg = (e: unknown): string => {
  if (e instanceof Error) return e.message;
  if (typeof e === "string" && e.trim()) return e;
  return "Something went wrong";
};
