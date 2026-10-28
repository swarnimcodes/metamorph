import { create } from "zustand";
import { api } from "../api/client";
import type { WorkoutSummary } from "../api/types";
import { errMsg } from "./auth";

const PAGE = 20;

interface HistoryState {
  items: WorkoutSummary[];
  loading: boolean;
  loaded: boolean;
  hasMore: boolean;
  error: string | null;
  reload: () => Promise<void>;
  loadMore: () => Promise<void>;
  reset: () => void;
}

export const useHistory = create<HistoryState>((set, get) => ({
  items: [],
  loading: false,
  loaded: false,
  hasMore: false,
  error: null,

  reload: async () => {
    set({ loading: true, error: null });
    try {
      const items = await api.listWorkouts(undefined, PAGE);
      set({ items, hasMore: items.length === PAGE, loaded: true, loading: false });
    } catch (e) {
      set({ error: errMsg(e), loading: false });
    }
  },

  loadMore: async () => {
    const { items, loading } = get();
    const last = items.at(-1);
    if (loading || !last) return;
    set({ loading: true, error: null });
    try {
      const more = await api.listWorkouts(last.started_at, PAGE);
      const seen = new Set(items.map((w) => w.id));
      set({
        items: [...items, ...more.filter((w) => !seen.has(w.id))],
        hasMore: more.length === PAGE,
        loading: false,
      });
    } catch (e) {
      set({ error: errMsg(e), loading: false });
    }
  },

  reset: () => set({ items: [], loaded: false, hasMore: false, error: null }),
}));
