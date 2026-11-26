import { describe, expect, it } from "vitest";
import { cityOptions } from "./geo";

const all = { MH: ["Nagpur", "Pune"], KA: ["Bengaluru", "Pune"] };
const names = (o: { label: string }[]) => o.map((x) => x.label);

describe("cityOptions", () => {
  it("offers the chosen state's cities", () => {
    expect(names(cityOptions(all, "MH"))).toEqual(["Nagpur", "Pune"]);
  });

  it("offers every city once, sorted, when no state is chosen", () => {
    expect(names(cityOptions(all, null))).toEqual(["Bengaluru", "Nagpur", "Pune"]);
  });

  it("falls back to every city for a state the data does not have", () => {
    expect(names(cityOptions(all, "XX"))).toEqual(["Bengaluru", "Nagpur", "Pune"]);
  });
});
