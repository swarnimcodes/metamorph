import { create } from "zustand";
import { api, ApiError, setSessionExpiredHandler, storeLogin } from "../api/client";
import { clearSession, loadSession } from "../api/tokenStorage";
import type { LoginResponse, Me, MeUpdate } from "../api/types";

type Status = "loading" | "signed-out" | "signed-in" | "unreachable";

interface AuthState {
  status: Status;
  user: Me | null;
  error: string | null;
  /** Resume a stored session on app start. */
  init: () => Promise<void>;
  /** Shared tail of every sign-in method: persist tokens, then load the profile. */
  completeLogin: (r: LoginResponse) => Promise<void>;
  /** Dev-only username login. A Google sign-in would call completeLogin() with its own response. */
  devLogin: (username: string) => Promise<void>;
  logout: () => void;
  /** PATCH /me; the returned profile replaces the stored user so every screen re-renders. */
  updateProfile: (patch: MeUpdate) => Promise<void>;
}

export const useAuth = create<AuthState>((set, get) => ({
  status: "loading",
  user: null,
  error: null,

  init: async () => {
    if (!loadSession()) return set({ status: "signed-out" });
    try {
      set({ status: "signed-in", user: await api.me(), error: null });
    } catch (e) {
      // A 401 already triggered logout via the session-expired handler.
      if (e instanceof ApiError && e.status === 0) set({ status: "unreachable", error: e.message });
      else if (get().status !== "signed-out") set({ status: "unreachable", error: errMsg(e) });
    }
  },

  completeLogin: async (r) => {
    storeLogin(r);
    set({ user: await api.me(), status: "signed-in", error: null });
  },

  devLogin: async (username) => {
    await get().completeLogin(await api.devLogin(username.trim()));
  },

  logout: () => {
    clearSession();
    set({ status: "signed-out", user: null });
  },

  updateProfile: async (patch) => {
    set({ user: await api.updateMe(patch) });
  },
}));

setSessionExpiredHandler(() => useAuth.getState().logout());

export const errMsg = (e: unknown): string => (e instanceof Error ? e.message : "Something went wrong");
