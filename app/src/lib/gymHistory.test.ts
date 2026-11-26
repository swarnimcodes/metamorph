import { describe, expect, it } from "vitest";
import { describeEdit, placeLine } from "./gymHistory";

describe("describeEdit", () => {
  it("says what changed, in a stable field order", () => {
    const lines = describeEdit({
      changes: {
        state: { from: "Maharashtra", to: null },
        city: { from: "Pune", to: "Pune City" },
        chain: { from: null, to: "Cult" },
        name: { from: "Iron", to: "Iron Works" },
      },
    });
    expect(lines).toEqual(["Name: Iron → Iron Works", "Chain added: Cult", "City: Pune → Pune City", "State removed"]);
  });

  it("names countries rather than showing their codes", () => {
    const [line] = describeEdit({ changes: { country_code: { from: null, to: "IN" } } });
    expect(line).toMatch(/^Country added: (India|IN)$/);
  });
});

describe("placeLine", () => {
  it("skips what is missing", () => {
    expect(placeLine({ area: "Aundh", city: "Pune", state: null, country_code: null })).toBe("Aundh · Pune");
    expect(placeLine({ area: null, city: null, state: null, country_code: null })).toBe("");
  });
});
