import { describe, expect, it } from "vitest";
import { addDays, buildGrid, intensity, weekdayIndex } from "./heatmap";

describe("dates", () => {
  it("weekdayIndex is Monday-first", () => {
    expect(weekdayIndex("2025-10-27")).toBe(0); // Monday
    expect(weekdayIndex("2025-11-02")).toBe(6); // Sunday
  });
  it("addDays crosses month and year", () => {
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("intensity", () => {
  it.each([[0, 0], [1, 1], [2, 2], [3, 3], [7, 3]])("%s workouts -> level %s", (n, l) => {
    expect(intensity(n)).toBe(l);
  });
});

describe("buildGrid", () => {
  const from = "2026-10-05"; // Monday
  it("makes week columns of 7 rows, Monday first", () => {
    const g = buildGrid(from, "2026-10-28", []); // Wednesday
    expect(g.weeks).toHaveLength(4);
    expect(g.weeks[0][0]?.date).toBe("2026-10-05");
    expect(g.weeks[0][6]?.date).toBe("2026-10-11");
    expect(g.weeks.every((w) => w.length === 7)).toBe(true);
  });
  it("leaves days after `to` empty", () => {
    const g = buildGrid(from, "2026-10-28", []);
    const last = g.weeks[3];
    expect(last[2]?.date).toBe("2026-10-28");
    expect(last.slice(3)).toEqual([null, null, null, null]);
  });
  it("fills sparse days and zero days", () => {
    const g = buildGrid(from, "2026-10-28", [{ date: "2026-10-07", workouts: 2, sets: 9, volume_kg: 500 }]);
    expect(g.weeks[0][2]).toMatchObject({ date: "2026-10-07", workouts: 2, sets: 9, volume_kg: 500, level: 2 });
    expect(g.weeks[0][3]).toMatchObject({ workouts: 0, level: 0 });
  });
  it("a Sunday `to` fills the last column", () => {
    const g = buildGrid(from, "2026-10-11", []);
    expect(g.weeks).toHaveLength(1);
    expect(g.weeks[0][6]?.date).toBe("2026-10-11");
  });
  it("labels the week containing the 1st, plus a leading label when there is room", () => {
    const g = buildGrid("2026-09-07", "2026-11-10", []);
    // Oct 1 2026 is a Thursday in the week starting 2026-09-28 (col 3); Nov 1 is a Sunday (col 7).
    expect(g.months).toEqual([
      { col: 0, month: 8 },
      { col: 3, month: 9 },
      { col: 7, month: 10 },
    ]);
  });
  it("drops the leading label when the first 1st is two columns away", () => {
    expect(buildGrid("2026-09-14", "2026-11-10", []).months[0]).toEqual({ col: 2, month: 9 });
  });
  it("skips the leading label when the first 1st is close", () => {
    const g = buildGrid("2026-09-28", "2026-11-10", []);
    expect(g.months[0]).toEqual({ col: 0, month: 9 }); // col 0 holds Oct 1
    expect(g.months.filter((m) => m.col === 0)).toHaveLength(1);
  });
  it("covers 53 weeks", () => {
    const g = buildGrid("2025-10-27", "2026-10-28", []);
    expect(g.weeks).toHaveLength(53);
  });
});
