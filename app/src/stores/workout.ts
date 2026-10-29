import { create } from "zustand";
import { api } from "../api/client";
import type {
  Exercise, ExerciseKind, Gym, LastSession, SetInput, Workout, WorkoutExercise, WorkoutSet,
} from "../api/types";
import { workoutChanged } from "../lib/invalidate";
import { queryClient } from "../lib/queryClient";
import { keys } from "../lib/queryKeys";
import { toastError } from "../lib/toast";
import { errMsg } from "./auth";

/** Which set (by index) of a past session matches the set about to be added. */
export function referenceSet(hint: LastSession | null | undefined, index: number): WorkoutSet | undefined {
  return hint?.sets[index] ?? hint?.sets.at(-1);
}

const FIELDS_BY_KIND: Record<ExerciseKind, (keyof SetInput)[]> = {
  weight_reps: ["weight_kg", "reps"],
  bodyweight_reps: ["reps", "weight_kg"],
  duration: ["duration_s"],
  distance: ["distance_m", "duration_s"],
};

interface WorkoutState {
  workout: Workout | null;
  loading: boolean;
  error: string | null;
  /** keyed by `${exercise_id}|${variant_key}`; null = never done or lookup failed */
  hints: Record<string, LastSession | null>;

  load: (id: string) => Promise<void>;
  clear: () => void;
  loadHint: (we: WorkoutExercise) => Promise<void>;
  rename: (title: string) => Promise<void>;
  setGym: (gym: Gym) => Promise<void>;
  addExercise: (ex: Exercise, tagIds: string[]) => Promise<boolean>;
  removeExercise: (weId: string) => Promise<void>;
  addSet: (we: WorkoutExercise) => Promise<void>;
  updateSet: (weId: string, setId: string, patch: SetInput) => Promise<void>;
  deleteSet: (weId: string, setId: string) => Promise<void>;
  finish: () => Promise<boolean>;
  discard: () => Promise<boolean>;
}

/**
 * Whatever just happened to this workout, whether it worked or not, make cached history, stats and
 * "last time" hints re-check the server. After a failure that is what repairs any drift; after a
 * success it is what updates the counts and charts. Only what is on screen refetches now.
 */
const changed = () => void workoutChanged();

const hintKey = (we: WorkoutExercise) => `${we.exercise_id}|${we.variant_key}`;
const setSeq = new Map<string, number>();

function mapExercises(w: Workout, f: (we: WorkoutExercise) => WorkoutExercise): Workout {
  return { ...w, exercises: w.exercises.map(f) };
}

function mapSets(w: Workout, weId: string, f: (s: WorkoutSet[]) => WorkoutSet[]): Workout {
  return mapExercises(w, (we) => (we.id === weId ? { ...we, sets: f(we.sets) } : we));
}

export const useWorkout = create<WorkoutState>((set, get) => ({
  workout: null,
  loading: false,
  error: null,
  hints: {},

  load: async (id) => {
    if (get().workout?.id !== id) set({ workout: null, hints: {} });
    set({ loading: true, error: null });
    try {
      const workout = await api.getWorkout(id);
      set({ workout, loading: false });
    } catch (e) {
      set({ error: errMsg(e), loading: false });
    }
  },

  clear: () => set({ workout: null, error: null, hints: {} }),

  loadHint: async (we) => {
    const key = hintKey(we);
    if (key in get().hints) return;
    set((s) => ({ hints: { ...s.hints, [key]: null } })); // mark in-flight; stays null on failure
    try {
      // Kept until a workout change marks it stale (see invalidate.ts): a hint is "your previous session
      // of this lift", which only another workout can change, so it needs no timer.
      const hint = await queryClient.fetchQuery({
        queryKey: keys.lastSession.one(we.exercise_id, we.variant_key),
        queryFn: () => api.lastSession(we.exercise_id, we.variant_key),
        staleTime: Infinity,
      });
      set((s) => ({ hints: { ...s.hints, [key]: hint } }));
    } catch {
      /* 404 = never done; any other failure just means no hint */
    }
  },

  rename: async (title) => {
    const w = get().workout;
    if (!w || title === (w.title ?? "")) return;
    const prev = w.title;
    set({ workout: { ...w, title } });
    try {
      await api.updateWorkout(w.id, { title });
    } catch (e) {
      patchWorkout(set, get, { title: prev });
      toastError(`Couldn't rename: ${errMsg(e)}`);
    } finally {
      changed();
    }
  },

  setGym: async (gym) => {
    const w = get().workout;
    if (!w) return;
    const prev = { gym_id: w.gym_id, gym: w.gym };
    set({ workout: { ...w, gym_id: gym.id, gym: { id: gym.id, name: gym.name, area: gym.area, city: gym.city, lat: gym.lat, lng: gym.lng, maps_url: gym.maps_url } } });
    try {
      const server = await api.updateWorkout(w.id, { gym_id: gym.id });
      patchWorkout(set, get, { gym_id: server.gym_id, gym: server.gym });
    } catch (e) {
      patchWorkout(set, get, prev);
      toastError(`Couldn't set gym: ${errMsg(e)}`);
    } finally {
      changed();
    }
  },

  addExercise: async (ex, tagIds) => {
    const w = get().workout;
    if (!w) return false;
    try {
      const we = await api.addExercise(w.id, ex.id, tagIds);
      set((s) => ({
        workout: s.workout && { ...s.workout, exercises: [...s.workout.exercises, we] },
      }));
      return true;
    } catch (e) {
      toastError(`Couldn't add exercise: ${errMsg(e)}`);
      return false;
    } finally {
      changed();
    }
  },

  removeExercise: async (weId) => {
    const w = get().workout;
    if (!w) return;
    set({ workout: { ...w, exercises: w.exercises.filter((e) => e.id !== weId) } });
    try {
      await api.removeExercise(weId);
    } catch (e) {
      toastError(`Couldn't remove exercise: ${errMsg(e)}`);
      void get().load(w.id);
    } finally {
      changed();
    }
  },

  addSet: async (we) => {
    const kind = we.kind;
    const hint = get().hints[hintKey(we)];
    const ref = referenceSet(hint, we.sets.length) ?? we.sets.at(-1);
    const body: SetInput = {};
    if (ref) {
      for (const f of FIELDS_BY_KIND[kind]) {
        const v = ref[f as keyof WorkoutSet];
        if (typeof v === "number") (body as Record<string, number>)[f] = v;
      }
    }
    try {
      const created = await api.addSet(we.id, body);
      set((s) => ({ workout: s.workout && mapSets(s.workout, we.id, (sets) => [...sets, created]) }));
    } catch (e) {
      toastError(`Couldn't add set: ${errMsg(e)}`);
    } finally {
      changed();
    }
  },

  updateSet: async (weId, setId, patch) => {
    const w = get().workout;
    const prev = w?.exercises.find((e) => e.id === weId)?.sets.find((s) => s.id === setId);
    if (!w || !prev) return;
    const seq = (setSeq.get(setId) ?? 0) + 1;
    setSeq.set(setId, seq);
    const replace = (next: WorkoutSet) =>
      set((s) => ({ workout: s.workout && mapSets(s.workout, weId, (sets) => sets.map((x) => (x.id === setId ? next : x))) }));
    replace({ ...prev, ...patch } as WorkoutSet);
    try {
      const server = await api.updateSet(setId, patch);
      if (setSeq.get(setId) === seq) replace(server);
    } catch (e) {
      if (setSeq.get(setId) === seq) replace(prev);
      toastError(`Couldn't save set: ${errMsg(e)}`);
    } finally {
      changed();
    }
  },

  deleteSet: async (weId, setId) => {
    const w = get().workout;
    const we = w?.exercises.find((e) => e.id === weId);
    const prev = we?.sets.find((s) => s.id === setId);
    if (!w || !we || !prev) return;
    const index = we.sets.indexOf(prev);
    set({ workout: mapSets(w, weId, (sets) => sets.filter((s) => s.id !== setId)) });
    try {
      await api.deleteSet(setId);
    } catch (e) {
      set((s) => ({
        workout:
          s.workout &&
          mapSets(s.workout, weId, (sets) => [...sets.slice(0, index), prev, ...sets.slice(index)]),
      }));
      toastError(`Couldn't delete set: ${errMsg(e)}`);
    } finally {
      changed();
    }
  },

  finish: async () => {
    const w = get().workout;
    if (!w) return false;
    try {
      await api.finishWorkout(w.id);
      return true;
    } catch (e) {
      toastError(`Couldn't finish workout: ${errMsg(e)}`);
      return false;
    } finally {
      changed();
    }
  },

  discard: async () => {
    const w = get().workout;
    if (!w) return false;
    try {
      await api.deleteWorkout(w.id);
      return true;
    } catch (e) {
      toastError(`Couldn't discard workout: ${errMsg(e)}`);
      return false;
    } finally {
      changed();
    }
  },
}));

type Setter = (partial: Partial<WorkoutState>) => void;
function patchWorkout(set: Setter, get: () => WorkoutState, patch: Partial<Workout>) {
  const w = get().workout;
  if (w) set({ workout: { ...w, ...patch } });
}
