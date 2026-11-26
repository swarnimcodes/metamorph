import { describe, expect, it } from "vitest";
import type { Gym } from "../api/types";
import { emptyGymForm, formDiff, gymToForm } from "../components/GymForm";

const gym: Gym = {
  id: "g1", name: "Iron Works", chain: null, area: "Aundh", address: null, city: "Pune", lat: null, lng: null,
  maps_url: null, verified: false, country_code: "IN", state: "Maharashtra",
};

describe("gym form", () => {
  it("turns a gym into form text and back to nothing changed", () => {
    expect(formDiff(gymToForm(gym), gymToForm(gym))).toEqual({});
  });

  it("sends only what changed, trimmed", () => {
    const before = gymToForm(gym);
    expect(formDiff(before, { ...before, city: " Pune City ", chain: "Cult" })).toEqual({ city: "Pune City", chain: "Cult" });
  });

  it("sends a blank for a field that was emptied, which clears it server-side", () => {
    const before = gymToForm(gym);
    expect(formDiff(before, { ...before, state: "", area: "  " })).toEqual({ state: "", area: "" });
  });

  it("does not count whitespace-only differences as edits", () => {
    const before = gymToForm(gym);
    expect(formDiff(before, { ...before, name: " Iron Works " })).toEqual({});
    expect(formDiff(emptyGymForm(), emptyGymForm())).toEqual({});
  });
});
