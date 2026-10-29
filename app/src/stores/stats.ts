import { create } from "zustand";
import { api } from "../api/client";
import type { BodyWeightEntry, Consistency, ExerciseProgress, StatsExercise } from "../api/types";
import { errMsg } from "./auth";

/** In-memory cache only; screens re-fetch on mount and show the cached copy meanwhile. */
interface StatsState {
  consistency: Consistency | null;
  exercises: StatsExercise[] | null;
  /** Oldest first. */
  bodyWeights: BodyWeightEntry[] | null;
  progress: Record<string, ExerciseProgress>;
  errors: Record<string, string>;
  loadConsistency: () => Promise<void>;
  loadExercises: () => Promise<void>;
  loadProgress: (exerciseId: string, variant: string | null) => Promise<void>;
  loadBodyWeights: () => Promise<void>;
  logBodyWeight: (date: string, kg: number) => Promise<void>;
  deleteBodyWeight: (date: string) => Promise<void>;
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
    bodyWeights: null,
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
    loadBodyWeights: async () => {
      try {
        set({ bodyWeights: await api.bodyWeights() });
        ok("bodyWeights");
      } catch (e) {
        fail("bodyWeights", e);
      }
    },
    // Both throw on failure so the sheet that asked can stay open and show why.
    logBodyWeight: async (date, kg) => {
      const saved = await api.logBodyWeight(date, kg);
      set((s) => ({
        bodyWeights: [...(s.bodyWeights ?? []).filter((w) => w.date !== saved.date), saved].sort((a, b) =>
          a.date < b.date ? -1 : 1,
        ),
      }));
    },
    deleteBodyWeight: async (date) => {
      await api.deleteBodyWeight(date);
      set((s) => ({ bodyWeights: (s.bodyWeights ?? []).filter((w) => w.date !== date) }));
    },
    reset: () => set({ consistency: null, exercises: null, bodyWeights: null, progress: {}, errors: {} }),
  };
});
