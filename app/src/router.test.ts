import { describe, expect, it } from "vitest";
import { parseRoute, paths } from "./router";

const WORKOUT = "01a18388-81e5-7110-ac64-dc7d9eefe3bc";
const EXERCISE = "01a18392-f771-7406-a324-829efd0fdf1f";

describe("exercise progress routes", () => {
  it("round-trips the variation and the place it was opened from", () => {
    const from = paths.detail(WORKOUT);
    const route = parseRoute(`#${paths.exercise(EXERCISE, "ez-bar+preacher", from)}`);
    expect(route).toEqual({ name: "exercise", id: EXERCISE, variant: "ez-bar+preacher", from });
  });

  it("keeps untagged (empty variant) distinct from all variations", () => {
    expect(parseRoute(`#${paths.exercise(EXERCISE, "")}`)).toMatchObject({ variant: "", from: null });
    expect(parseRoute(`#${paths.exercise(EXERCISE, null)}`)).toMatchObject({ variant: null, from: null });
  });

  it("builds the plain link when nothing extra is needed", () => {
    expect(paths.exercise(EXERCISE, null)).toBe(`/stats/exercise/${EXERCISE}`);
    expect(paths.exercise(EXERCISE, "")).toBe(`/stats/exercise/${EXERCISE}?v=`);
    expect(paths.exercise(EXERCISE, "cable", paths.detail(WORKOUT))).toBe(
      `/stats/exercise/${EXERCISE}?v=cable&from=%2Fhistory%2F${WORKOUT}`,
    );
  });

  it("accepts only in-app places as a back target", () => {
    for (const from of ["/history/not-an-id", "/settings", "//evil.example", "https://evil.example", "/history/" + WORKOUT + "/x", "javascript:alert(1)"]) {
      const route = parseRoute(`#/stats/exercise/${EXERCISE}?${new URLSearchParams({ v: "", from })}`);
      expect(route, from).toMatchObject({ name: "exercise", from: null });
    }
    expect(parseRoute(`#/stats/exercise/${EXERCISE}?${new URLSearchParams({ from: "/stats" })}`)).toMatchObject({ from: "/stats" });
  });
});
