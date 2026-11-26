import { describe, expect, it } from "vitest";
import { filterOptions, fold, type Option } from "./typeahead";

const opts = (...labels: string[]): Option[] => labels.map((l) => ({ value: l, label: l }));
const labels = (o: Option[]) => o.map((x) => x.label);

describe("filterOptions", () => {
  const cities = opts("Pune", "Punjab Bagh", "Pimpri", "Nagpur", "São Paulo");

  it("puts names that start with the text before names that contain it", () => {
    expect(labels(filterOptions(cities, "pu"))).toEqual(["Pune", "Punjab Bagh", "Nagpur"]);
  });

  it("ignores case and accents", () => {
    expect(labels(filterOptions(cities, "SAO"))).toEqual(["São Paulo"]);
    expect(fold("  Zürich ")).toBe("zurich");
  });

  it("lists the first few when nothing is typed, and never more than the limit", () => {
    expect(filterOptions(cities, "", 2)).toHaveLength(2);
    expect(filterOptions(cities, "  ", 3)).toHaveLength(3);
    expect(filterOptions(cities, "p", 2)).toHaveLength(2);
  });

  it("finds nothing for text that matches nothing", () => {
    expect(filterOptions(cities, "zzz")).toEqual([]);
  });
});
