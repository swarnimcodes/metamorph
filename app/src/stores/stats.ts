import { create } from "zustand";
import { api } from "../api/client";
import type { Consistency, ExerciseProgress, StatsExercise } from "../api/types";
import { errMsg } from "./auth";

/** In-memory cache only; screens re-fetch on mount and show the cached copy meanwhile. */
interface StatsState {
  consistency: Consistency | null;
  exercises: StatsExercise[] | null;
  progress: Record<string, ExerciseProgress>;
  errors: Record<string, string>;
  loadConsistency: () => Promise<void>;
  loadExercises: () => Promise<void>;
  loadProgress: (exerciseId: string, variant: string | null) => Promise<void>;
  reset: () => void;
}

export const progressKey = (exerciseId: string, variant: string | null): string =>
  `${exerciseId}|${variant === null ? "*" : variant}`;

export const useStats = create<StatsState>((set) => {
  const fail = (key: string, e: unknown) => set((s) => ({ errors: { ...s.errors, [key]: errMsg(e) } }));
  const ok = (key: string) =>
    set((s) => {
      const { [key]: _drop, ...errors } = s.errors;
      return { errors };
    });
  return {
    consistency: null,
    exercises: null,
    progress: {},
    errors: {},

    loadConsistency: async () => {
      try {
        const consistency = await api.consistency();
        set({ consistency });
        ok("consistency");
      } catch (e) {
        fail("consistency", e);
      }
    },
    loadExercises: async () => {
      try {
        const exercises = await api.statsExercises();
        set({ exercises });
        ok("exercises");
      } catch (e) {
        fail("exercises", e);
      }
    },
    loadProgress: async (exerciseId, variant) => {
      const key = progressKey(exerciseId, variant);
      try {
        const p = await api.exerciseProgress(exerciseId, variant ?? undefined);
        set((s) => ({ progress: { ...s.progress, [key]: p } }));
        ok(key);
      } catch (e) {
        fail(key, e);
      }
    },
    reset: () => set({ consistency: null, exercises: null, progress: {}, errors: {} }),
  };
});
