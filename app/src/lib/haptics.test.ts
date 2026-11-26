import { describe, expect, it } from "vitest";
import { parseEnabled, webPattern } from "./haptics";

describe("haptics", () => {
  it("is on unless someone turned it off", () => {
    expect(parseEnabled(null)).toBe(true);
    expect(parseEnabled("on")).toBe(true);
    expect(parseEnabled("garbage")).toBe(true);
    expect(parseEnabled("off")).toBe(false);
  });

  it("feels different for an everyday tap, a success and an error", () => {
    expect(webPattern("tap")).toBeLessThan(20);
    expect(Array.isArray(webPattern("success"))).toBe(true);
    expect(webPattern("error")).not.toEqual(webPattern("success"));
  });
});
