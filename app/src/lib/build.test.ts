import { describe, expect, it } from "vitest";
import { describeBuild } from "./build";

describe("describeBuild", () => {
  it("shows the version and the commit a CI build came from", () => {
    expect(describeBuild("0.1.3", "a1c3ae6")).toBe("0.1.3 · a1c3ae6");
  });
  it("says so when there is no commit, instead of showing an empty or made-up one", () => {
    expect(describeBuild("0.1.3", "")).toBe("0.1.3 · local build");
  });
});
