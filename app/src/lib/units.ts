import type { UnitSystem } from "../api/types";

const LB_PER_KG = 2.20462262185;

const round = (v: number, decimals: number): number => {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
};

/**
 * The single place weights are converted. Storage is always kg (numeric(7,3)).
 * Display rounds to at most 2 decimals; String() of the result drops trailing zeros.
 */
export function kgToDisplay(kg: number | null | undefined, unit: UnitSystem): number | null {
  if (kg === null || kg === undefined) return null;
  const v = unit === "imperial" ? Number(kg) * LB_PER_KG : Number(kg);
  return round(v, 2);
}

/** Full-precision conversion to kg, rounded to the 3 decimals the DB column keeps. */
export function displayToKg(value: number, unit: UnitSystem): number {
  return round(unit === "imperial" ? value / LB_PER_KG : value, 3);
}

export const weightLabel = (unit: UnitSystem): string => (unit === "imperial" ? "lb" : "kg");

export function formatWeight(kg: number | null | undefined, unit: UnitSystem): string {
  const v = kgToDisplay(kg, unit);
  return v === null ? "" : `${v} ${weightLabel(unit)}`;
}
