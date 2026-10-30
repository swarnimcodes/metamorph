import { describe, expect, it } from "vitest";
import { formatDate, formatTime } from "./format";
import { deviceTimeZone, zoneNeedsSync } from "./timezone";

describe("deviceTimeZone", () => {
  it("is a real zone the platform accepts", () => {
    const z = deviceTimeZone();
    expect(z.length).toBeGreaterThan(0);
    expect(() => new Intl.DateTimeFormat("en", { timeZone: z })).not.toThrow();
  });
});

describe("zoneNeedsSync", () => {
  it("is true when the profile is behind the device, false when they agree", () => {
    expect(zoneNeedsSync("UTC", "Asia/Kolkata")).toBe(true);
    expect(zoneNeedsSync("Asia/Kolkata", "America/Los_Angeles")).toBe(true);
    expect(zoneNeedsSync("Asia/Kolkata", "Asia/Kolkata")).toBe(false);
  });
  it("syncs a profile with no zone, and never to an empty device zone", () => {
    expect(zoneNeedsSync(undefined, "Asia/Kolkata")).toBe(true);
    expect(zoneNeedsSync("Asia/Kolkata", "")).toBe(false);
  });
});

// 2026-01-05 20:00 UTC: midday in Los Angeles, the next morning (01:30) in India.
const MOMENT = "2026-01-05T20:00:00Z";

describe("a moment is shown as it was where it happened", () => {
  it("dates it in its own zone, not the device's", () => {
    const now = new Date("2026-06-01T00:00:00Z");
    expect(formatDate(MOMENT, "America/Los_Angeles", now)).toMatch(/\b5\b/);
    expect(formatDate(MOMENT, "Asia/Kolkata", now)).toMatch(/\b6\b/);
    expect(formatDate(MOMENT, "America/Los_Angeles", now)).not.toBe(formatDate(MOMENT, "Asia/Kolkata", now));
  });

  it("decides whether to show the year in that zone too", () => {
    const now = new Date("2026-06-01T00:00:00Z");
    // 2025-12-31 20:00 UTC is already 1 Jan 2026 in India (this year) but still 2025 in UTC.
    const newYearsEve = "2025-12-31T20:00:00Z";
    expect(formatDate(newYearsEve, "Asia/Kolkata", now)).not.toMatch(/2025|2026/);
    expect(formatDate(newYearsEve, "UTC", now)).toMatch(/2025/);
  });

  it("shows the clock time of that zone", () => {
    expect(formatTime(MOMENT, "America/Los_Angeles", "America/Los_Angeles")).toMatch(/^12:00/);
    expect(formatTime(MOMENT, "Asia/Kolkata", "Asia/Kolkata")).toMatch(/^1:30/);
  });

  it("names the zone only when it is not where the device is now", () => {
    expect(formatTime(MOMENT, "America/Los_Angeles", "Asia/Kolkata")).toMatch(/PST|GMT-8/);
    expect(formatTime(MOMENT, "America/Los_Angeles", "America/Los_Angeles")).not.toMatch(/PST|GMT/);
  });
});
