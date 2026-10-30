import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Workout, WorkoutSet } from "../api/types";
import { queryClient } from "../lib/queryClient";
import { keys } from "../lib/queryKeys";

const mocks = vi.hoisted(() => ({
  updateSet: vi.fn(),
  addSet: vi.fn(),
  deleteSet: vi.fn(),
  finishWorkout: vi.fn(),
  deleteWorkout: vi.fn(),
  updateWorkout: vi.fn(),
}));
vi.mock("../api/client", async (original) => ({ ...(await original<typeof import("../api/client")>()), api: mocks }));
vi.mock("../lib/toast", () => ({ toastError: vi.fn() }));

import { useWorkout } from "./workout";

const SET: WorkoutSet = {
  id: "s1", position: 1, set_type: "working", weight_kg: 40, reps: 8, duration_s: null, distance_m: null, rir: null, note: null,
  completed_at: null,
};
const WORKOUT: Workout = {
  id: "w1", title: null, gym_id: null, gym: null, started_at: "2026-01-01T09:00:00Z", ended_at: null, timezone: "UTC", notes: null,
  exercises: [{
    id: "we1", exercise_id: "e1", exercise_name: "Bench Press", kind: "weight_reps", position: 1, variant_key: "",
    superset_group: null, notes: null, tags: [], sets: [SET],
  }],
};

const WATCHED = [
  keys.workouts.list(), keys.workouts.detail("w1"), keys.stats.consistency(), keys.stats.progress("e1", null),
  keys.lastSession.one("e1", ""),
];
const isStale = (key: readonly unknown[]) => queryClient.getQueryState(key)?.isInvalidated === true;

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
  for (const key of WATCHED) queryClient.setQueryData(key, ["cached"]);
  queryClient.setQueryData(keys.bodyWeights, ["unrelated"]);
  useWorkout.setState({ workout: structuredClone(WORKOUT), hints: {} });
});

/** The cache must be re-checked whether the server said yes or no: a failure is when it is most likely to have drifted. */
describe.each([
  ["saving a set", () => useWorkout.getState().updateSet("we1", "s1", { reps: 9 }), mocks.updateSet],
  ["adding a set", () => useWorkout.getState().addSet(WORKOUT.exercises[0]), mocks.addSet],
  ["deleting a set", () => useWorkout.getState().deleteSet("we1", "s1"), mocks.deleteSet],
  ["finishing", () => useWorkout.getState().finish(), mocks.finishWorkout],
  ["discarding", () => useWorkout.getState().discard(), mocks.deleteWorkout],
])("%s", (_name, act, api) => {
  it("marks history, stats and hints stale when it succeeds", async () => {
    api.mockResolvedValue(SET);
    await act();
    for (const key of WATCHED) expect(isStale(key), JSON.stringify(key)).toBe(true);
    expect(isStale(keys.bodyWeights)).toBe(false);
  });

  it("marks them stale when it fails too", async () => {
    api.mockRejectedValue(new Error("offline"));
    await act();
    for (const key of WATCHED) expect(isStale(key), JSON.stringify(key)).toBe(true);
  });
});
