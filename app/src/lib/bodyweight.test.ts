import { describe, expect, it } from "vitest";
import type { BodyWeightEntry, ProgressPoint } from "../api/types";
import { changeOver, relativeStrength, shiftDay, sinceDays, todayIn, trailingAverage, weightOn } from "./bodyweight";

const bw = (date: string, kg: number): BodyWeightEntry => ({ date, weight_kg: kg });
const session = (date: string, e1rm: number | null): ProgressPoint => ({
  date, workout_id: date, sets: 3, volume_kg: null, top_weight_kg: null, best_e1rm_kg: e1rm,
  top_reps: null, total_reps: null, best_duration_s: null, total_duration_s: null, best_distance_m: null, total_distance_m: null,
});

describe("todayIn", () => {
  it("uses the calendar date in the given timezone, not UTC", () => {
    const instant = new Date("2026-10-28T21:30:00Z");
    expect(todayIn("UTC", instant)).toBe("2026-10-28");
    expect(todayIn("Asia/Kolkata", instant)).toBe("2026-10-29");
    expect(todayIn("America/Los_Angeles", instant)).toBe("2026-10-28");
  });
});

describe("shiftDay", () => {
  it("crosses month and year ends", () => {
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("weightOn", () => {
  const w = [bw("2026-01-01", 80), bw("2026-01-10", 81)];
  it("takes the latest entry on or before the date", () => {
    expect(weightOn(w, "2026-01-10")?.weight_kg).toBe(81);
    expect(weightOn(w, "2026-01-09")?.weight_kg).toBe(80);
  });
  it("has nothing before the first entry", () => {
    expect(weightOn(w, "2025-12-31")).toBeNull();
  });
  it("ignores a weigh-in that is too old", () => {
    expect(weightOn(w, "2026-04-10")?.weight_kg).toBe(81);
    expect(weightOn(w, "2026-04-11")).toBeNull();
  });
});

describe("trailingAverage", () => {
  const w = [bw("2026-01-01", 90), bw("2026-01-05", 80), bw("2026-01-07", 82)];
  it("averages the 7 days ending on the date, inclusive", () => {
    expect(trailingAverage(w, "2026-01-07")).toBe((90 + 80 + 82) / 3);
    expect(trailingAverage(w, "2026-01-08")).toBe(81); // the 1st has dropped out
  });
  it("is null with no entries in the window", () => {
    expect(trailingAverage(w, "2026-02-01")).toBeNull();
  });
});

describe("changeOver", () => {
  it("compares the latest with the nearest entry on or before N days earlier", () => {
    const w = [bw("2026-01-01", 85), bw("2026-01-20", 84), bw("2026-01-31", 82)];
    expect(changeOver(w, 30)).toBe(-3);
    expect(changeOver(w, 7)).toBeCloseTo(-2); // 24th -> the 20th entry
  });
  it("is null without earlier history", () => {
    expect(changeOver([], 30)).toBeNull();
    expect(changeOver([bw("2026-01-31", 82)], 30)).toBeNull();
  });
});

describe("relativeStrength", () => {
  it("divides the session's 1RM by the bodyweight in force that day", () => {
    const out = relativeStrength([session("2026-01-12", 120), session("2026-01-02", 100)].reverse(), [bw("2026-01-01", 80), bw("2026-01-10", 100)]);
    expect(out.map((p) => p.value)).toEqual([1.25, 1.2]);
  });
  it("skips sessions without a 1RM or without any prior weigh-in", () => {
    expect(relativeStrength([session("2026-01-12", null), session("2025-12-01", 100)], [bw("2026-01-01", 80)])).toEqual([]);
  });
});

describe("sinceDays", () => {
  const w = [bw("2026-01-01", 80), bw("2026-02-01", 81), bw("2026-03-01", 82)];
  it("keeps entries inside the window, including its first day", () => {
    expect(sinceDays(w, "2026-03-01", 28).map((e) => e.date)).toEqual(["2026-02-01", "2026-03-01"]);
    expect(sinceDays(w, "2026-03-01", 27).map((e) => e.date)).toEqual(["2026-03-01"]);
  });
  it("null means all", () => {
    expect(sinceDays(w, "2026-03-01", null)).toHaveLength(3);
  });
});
