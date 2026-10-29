import type { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it } from "vitest";
import { ApiError } from "../api/client";
import { bodyWeightChanged, clearAll, gymChanged, workoutChanged } from "./invalidate";
import { createQueryClient } from "./queryClient";
import { keys } from "./queryKeys";

/** One entry in every part of the cache, so a rule that reaches too far or not far enough shows up. */
const SEEDED = {
  historyList: keys.workouts.list(),
  detail: keys.workouts.detail("w1"),
  otherDetail: keys.workouts.detail("w2"),
  consistency: keys.stats.consistency(),
  statsExercises: keys.stats.exercises(),
  progress: keys.stats.progress("e1", null),
  progressVariant: keys.stats.progress("e1", "ez-bar"),
  lastSession: keys.lastSession.one("e1", ""),
  bodyWeights: keys.bodyWeights,
  gymSearch: keys.gyms.search("cult"),
  exerciseSearch: keys.exercises.search("curl"),
  tags: keys.tags,
} as const;

let client: QueryClient;
beforeEach(() => {
  client = createQueryClient();
  for (const key of Object.values(SEEDED)) client.setQueryData(key, ["cached"]);
});

/** Names of the seeded entries a rule marked stale. */
function invalidated(): string[] {
  return Object.entries(SEEDED)
    .filter(([, key]) => client.getQueryState(key)?.isInvalidated)
    .map(([name]) => name)
    .sort();
}

describe("invalidation rules", () => {
  it("starts with nothing stale", () => {
    expect(invalidated()).toEqual([]);
  });

  it("a workout change refreshes history, every detail, every chart and the last-time hints, and nothing else", async () => {
    await workoutChanged(client);
    expect(invalidated()).toEqual(
      ["consistency", "detail", "historyList", "lastSession", "otherDetail", "progress", "progressVariant", "statsExercises"].sort(),
    );
  });

  it("a weigh-in refreshes only body weight", async () => {
    await bodyWeightChanged(client);
    expect(invalidated()).toEqual(["bodyWeights"]);
  });

  it("a new gym refreshes only gym searches", async () => {
    await gymChanged(client);
    expect(invalidated()).toEqual(["gymSearch"]);
  });

  it("signing out empties the cache", () => {
    clearAll(client);
    for (const key of Object.values(SEEDED)) expect(client.getQueryData(key)).toBeUndefined();
  });
});

describe("cache policy", () => {
  const defaults = () => createQueryClient().getDefaultOptions();

  it("treats user data as stale at once, so every mount re-checks the server", () => {
    expect(defaults().queries?.staleTime).toBe(0);
    expect(defaults().queries?.refetchOnWindowFocus).toBe(true);
    expect(defaults().queries?.refetchOnReconnect).toBe(true);
  });

  it("never retries a write", () => {
    expect(defaults().mutations?.retry).toBe(false);
  });

  it("retries a dropped connection once, but not a 4xx", () => {
    const retry = defaults().queries?.retry as (count: number, error: Error) => boolean;
    const offline = new ApiError(0, "offline");
    expect(retry(0, offline)).toBe(true);
    expect(retry(1, offline)).toBe(false);
    for (const status of [400, 401, 403, 404, 409, 422]) expect(retry(0, new ApiError(status, "no"))).toBe(false);
    expect(retry(0, new ApiError(500, "server"))).toBe(true);
  });
});
