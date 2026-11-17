import { describe, expect, it } from "vitest";
import { displayToKg, exerciseUnit, kgToDisplay } from "./units";

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

describe("lb entry round-trips exactly", () => {
  it("returns the typed pounds for every 0.25 lb step up to 1000 lb", () => {
    for (let lb = 0; lb <= 1000; lb += 0.25) {
      expect(kgToDisplay(displayToKg(lb, "imperial"), "imperial")).toBe(lb);
    }
  });

  it("does not drift when a displayed value is saved again", () => {
    let kg = displayToKg(135, "imperial");
    for (let i = 0; i < 50; i++) kg = displayToKg(kgToDisplay(kg, "imperial") as number, "imperial");
    expect(kg).toBe(displayToKg(135, "imperial"));
  });

  it("shows the same stored kg in either unit without changing it", () => {
    const kg = 61.235;
    expect(kgToDisplay(kg, "metric")).toBe(61.24);
    expect(kgToDisplay(kg, "imperial")).toBe(135);
    expect(exerciseUnit({ weight_unit: "imperial" }, "metric")).toBe("imperial");
    expect(exerciseUnit({ weight_unit: null }, "metric")).toBe("metric");
  });
});
