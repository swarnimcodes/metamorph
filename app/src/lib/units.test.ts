import { describe, expect, it } from "vitest";
import { displayToKg, kgToDisplay } from "./units";

describe("weight round trip", () => {
  it.each([5, 10, 15, 20, 25, 45, 100])("%s lb survives lb -> kg -> lb", (lb) => {
    expect(kgToDisplay(displayToKg(lb, "imperial"), "imperial")).toBe(lb);
  });
  it.each([2.5, 9.1, 22.5, 20, 0.25])("%s kg survives kg -> lb -> kg display", (kg) => {
    expect(kgToDisplay(displayToKg(kg, "metric"), "metric")).toBe(kg);
  });
  it("sends 3 decimals and shows 20 lb as 20", () => {
    expect(displayToKg(20, "imperial")).toBe(9.072);
    expect(String(kgToDisplay(9.072, "imperial"))).toBe("20");
    expect(kgToDisplay(9.072, "metric")).toBe(9.07);
  });
});
