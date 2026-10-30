import { describe, expect, it } from "vitest";
import { matchesUsername } from "./accountDeletion";

describe("matchesUsername", () => {
  it("accepts the username ignoring case and surrounding space", () => {
    expect(matchesUsername("swarnim", "swarnim")).toBe(true);
    expect(matchesUsername("  SwArNiM ", "swarnim")).toBe(true);
  });
  it("rejects anything else", () => {
    expect(matchesUsername("", "swarnim")).toBe(false);
    expect(matchesUsername("swarni", "swarnim")).toBe(false);
    expect(matchesUsername("swarnim2", "swarnim")).toBe(false);
    expect(matchesUsername("sw arnim", "swarnim")).toBe(false);
  });
  it("never matches when there is no username to match", () => {
    expect(matchesUsername("", "")).toBe(false);
    expect(matchesUsername("", undefined)).toBe(false);
    expect(matchesUsername("anything", null)).toBe(false);
  });
});
