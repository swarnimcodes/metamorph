import { describe, expect, it } from "vitest";
import { errMsg } from "./auth";

describe("errMsg", () => {
  it("uses an Error's message", () => {
    expect(errMsg(new Error("boom"))).toBe("boom");
  });
  it("shows a plugin's string rejection instead of hiding it", () => {
    expect(errMsg("Credential error [x]: Developer console is not set up correctly")).toContain("Developer console");
  });
  it("falls back for anything else", () => {
    expect(errMsg(undefined)).toBe("Something went wrong");
    expect(errMsg("  ")).toBe("Something went wrong");
    expect(errMsg({})).toBe("Something went wrong");
  });
});
