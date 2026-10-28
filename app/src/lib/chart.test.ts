import { describe, expect, it } from "vitest";
import { linear, nearestIndex, niceNum, niceScale, timeTicks, yScale } from "./chart";

describe("niceNum", () => {
  it.each([[1.2, 1], [2.4, 2], [4, 5], [8, 10], [130, 100]])("rounds %s to %s", (v, e) => {
    expect(niceNum(v, true)).toBe(e);
  });
  it("ceils when not rounding", () => {
    expect(niceNum(4.1, false)).toBe(5);
    expect(niceNum(0.3, false)).toBe(0.5);
  });
});

describe("niceScale", () => {
  it("covers the range on round ticks", () => {
    const s = niceScale(43, 87, 5);
    expect(s.ticks[0]).toBeLessThanOrEqual(43);
    expect(s.ticks.at(-1)).toBeGreaterThanOrEqual(87);
    expect(s.step).toBe(20);
    expect(s.ticks).toEqual([40, 60, 80, 100]);
  });
  it("has no float noise", () => {
    expect(niceScale(0, 1, 6).ticks).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
  });
  it("widens a flat series", () => {
    const s = niceScale(50, 50);
    expect(s.min).toBeLessThan(50);
    expect(s.max).toBeGreaterThan(50);
  });
  it("honours a natural unit (whole minutes)", () => {
    const s = niceScale(95, 400, 5, 60);
    expect(s.step % 60).toBe(0);
    expect(s.min).toBeLessThanOrEqual(95);
    expect(s.max).toBeGreaterThanOrEqual(400);
  });
});

describe("yScale", () => {
  it("starts at zero for totals", () => {
    expect(yScale([800, 1200, 1000], true).min).toBe(0);
  });
  it("does not force zero for bests, but stays at or above 0 for non-negative data", () => {
    const s = yScale([48, 50.5, 52], false);
    expect(s.min).toBeGreaterThan(0);
    expect(s.min).toBeLessThanOrEqual(48);
    expect(s.max).toBeGreaterThanOrEqual(52);
    expect(yScale([1, 2], false).min).toBeGreaterThanOrEqual(0);
  });
  it("copes with no values", () => {
    expect(yScale([], false).ticks.length).toBeGreaterThan(1);
  });
});

describe("helpers", () => {
  it("linear maps and centres a degenerate domain", () => {
    expect(linear(0, 10, 100, 200)(5)).toBe(150);
    expect(linear(3, 3, 0, 10)(3)).toBe(5);
  });
  it("timeTicks are ascending, whole-day, and bounded", () => {
    const DAY = 86_400_000;
    const t = timeTicks(0, 90 * DAY, 4);
    expect(t).toEqual([0, 30 * DAY, 60 * DAY, 90 * DAY]);
    expect(timeTicks(5 * DAY, 5 * DAY)).toEqual([5 * DAY]);
  });
  it("nearestIndex picks the closest x", () => {
    expect(nearestIndex([0, 10, 50], 12)).toBe(1);
    expect(nearestIndex([0, 10, 50], 40)).toBe(2);
  });
});
