import { describe, expect, it } from "vitest";
import type { ProgressPoint } from "../api/types";
import { axisUnit, bestIndex, formatDistance, formatTime, formatValue, metricsFor, seriesFor } from "./progress";

const pt = (o: Partial<ProgressPoint>): ProgressPoint => ({
  date: "2026-10-01", workout_id: "w", sets: 3, volume_kg: null, top_weight_kg: null, best_e1rm_kg: null,
  top_reps: null, total_reps: null, best_duration_s: null, total_duration_s: null,
  best_distance_m: null, total_distance_m: null, ...o,
});

describe("metricsFor", () => {
  it("weight_reps: 1RM first", () => {
    expect(metricsFor("weight_reps", []).map((m) => m.id)).toEqual(["e1rm", "top_weight", "volume"]);
  });
  it("bodyweight_reps offers top weight only when weighted", () => {
    expect(metricsFor("bodyweight_reps", [pt({ total_reps: 10 })]).map((m) => m.id)).toEqual(["total_reps", "top_reps"]);
    expect(metricsFor("bodyweight_reps", [pt({ top_weight_kg: 10 })]).map((m) => m.id)).toEqual(["total_reps", "top_reps", "top_weight"]);
  });
  it("duration and distance", () => {
    expect(metricsFor("duration", []).map((m) => m.label)).toEqual(["Best time", "Total time"]);
    expect(metricsFor("distance", []).map((m) => m.label)).toEqual(["Best distance", "Total distance"]);
  });
});

describe("seriesFor", () => {
  const points = [
    pt({ date: "2026-10-01", best_e1rm_kg: 100 }),
    pt({ date: "2026-10-08", best_e1rm_kg: null }),
    pt({ date: "2026-10-15", best_e1rm_kg: 110 }),
  ];
  const e1rm = metricsFor("weight_reps", points)[0];
  it("skips nulls rather than plotting zero", () => {
    expect(seriesFor(points, e1rm, "metric").map((s) => s.value)).toEqual([100, 110]);
  });
  it("converts weights to the display unit", () => {
    expect(seriesFor(points, e1rm, "imperial").map((s) => s.value)).toEqual([220.46, 242.51]);
  });
  it("leaves reps, time and distance untouched in imperial", () => {
    const reps = metricsFor("bodyweight_reps", [])[0];
    expect(seriesFor([pt({ total_reps: 24 })], reps, "imperial")[0].value).toBe(24);
  });
  it("bestIndex: highest, earliest on ties", () => {
    expect(bestIndex([{ value: 1 }, { value: 3 }, { value: 3 }])).toBe(1);
    expect(bestIndex([])).toBeNull();
  });
});

describe("formatting", () => {
  it("time", () => {
    expect(formatTime(90)).toBe("1:30");
    expect(formatTime(3725)).toBe("1:02:05");
  });
  it("distance", () => {
    expect(formatDistance(800)).toBe("800 m");
    expect(formatDistance(5200)).toBe("5.2 km");
  });
  it("weight uses the user's unit", () => {
    expect(formatValue(1240, "weight", "metric")).toBe("1,240 kg");
    expect(formatValue(40, "weight", "imperial")).toBe("40 lb");
  });
  it("axisUnit picks whole minutes / km for big ranges", () => {
    expect(axisUnit("time", 1800)).toBe(60);
    expect(axisUnit("time", 90)).toBe(1);
    expect(axisUnit("distance", 10000)).toBe(1000);
    expect(axisUnit("weight", 500)).toBe(1);
  });
});
