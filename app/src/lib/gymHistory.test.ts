import { describe, expect, it } from "vitest";
import { describeEdit, editTitle, placeLine } from "./gymHistory";

describe("describeEdit", () => {
  it("says what changed, in a stable field order", () => {
    const lines = describeEdit({
      kind: "edit",
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
    const [line] = describeEdit({ kind: "edit", changes: { country_code: { from: null, to: "IN" } } });
    expect(line).toMatch(/^Country added: (India|IN)$/);
  });
});

describe("editTitle", () => {
  it("names the moderation actions and leaves plain edits to their changes", () => {
    expect(editTitle({ kind: "edit", changes: {} })).toBeNull();
    expect(editTitle({ kind: "verify", changes: {} })).toBe("Marked verified");
    expect(editTitle({ kind: "unverify", changes: {} })).toBe("Verification removed");
    expect(editTitle({ kind: "delete", changes: {} })).toBe("Deleted");
    expect(editTitle({ kind: "revert", changes: {} })).toBe("Reverted an edit");
    expect(editTitle({ kind: "merge", changes: { merged_gym: { from: "Golds Gym", to: null } } })).toBe("Merged in “Golds Gym”");
    expect(editTitle({ kind: "merge", changes: {} })).toBe("Merged a duplicate");
  });

  it("lists field changes only for edits and reverts", () => {
    expect(describeEdit({ kind: "verify", changes: {} })).toEqual([]);
    expect(describeEdit({ kind: "merge", changes: { merged_gym: { from: "X", to: null } } })).toEqual([]);
    expect(describeEdit({ kind: "revert", changes: { city: { from: "Pune City", to: "Pune" } } })).toEqual(["City: Pune City → Pune"]);
  });
});

describe("placeLine", () => {
  it("skips what is missing", () => {
    expect(placeLine({ area: "Aundh", city: "Pune", state: null, country_code: null })).toBe("Aundh · Pune");
    expect(placeLine({ area: null, city: null, state: null, country_code: null })).toBe("");
  });
});
