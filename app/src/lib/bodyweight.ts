import type { BodyWeightEntry, ProgressPoint } from "../api/types";
import type { SeriesPoint } from "./progress";

const DAY_MS = 86_400_000;
/** A weigh-in older than this says nothing about the body at a later workout. */
const STALE_DAYS = 90;

/** Entries are "YYYY-MM-DD" calendar dates; this is the day count since the epoch. */
export function dayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

/** Today's calendar date in `timeZone` as "YYYY-MM-DD" (the day a weigh-in belongs to). */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** The most recent weigh-in on or before `date`, if there is a fresh enough one. `weights` is oldest first. */
export function weightOn(weights: BodyWeightEntry[], date: string): BodyWeightEntry | null {
  const day = dayNumber(date);
  let found: BodyWeightEntry | null = null;
  for (const w of weights) {
    if (dayNumber(w.date) > day) break;
    found = w;
  }
  return found && day - dayNumber(found.date) <= STALE_DAYS ? found : null;
}

/** Mean of the entries in the `days` days ending on `endDate` (inclusive); null when there are none. */
export function trailingAverage(weights: BodyWeightEntry[], endDate: string, days = 7): number | null {
  const end = dayNumber(endDate);
  const inWindow = weights.filter((w) => {
    const d = dayNumber(w.date);
    return d <= end && d > end - days;
  });
  if (inWindow.length === 0) return null;
  return inWindow.reduce((sum, w) => sum + Number(w.weight_kg), 0) / inWindow.length;
}

/** Latest weight minus the weight `days` before it (nearest earlier entry); null without enough history. */
export function changeOver(weights: BodyWeightEntry[], days: number): number | null {
  const latest = weights.at(-1);
  if (!latest) return null;
  const past = weightOn(weights.slice(0, -1), shiftDay(latest.date, -days));
  return past ? Number(latest.weight_kg) - Number(past.weight_kg) : null;
}

export function shiftDay(date: string, days: number): string {
  return new Date((dayNumber(date) + days) * DAY_MS).toISOString().slice(0, 10);
}

/** Estimated 1RM as a multiple of bodyweight on the day, skipping sessions with no usable weigh-in. */
export function relativeStrength(points: ProgressPoint[], weights: BodyWeightEntry[]): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  for (const point of points) {
    if (point.best_e1rm_kg === null) continue;
    const bw = weightOn(weights, point.date);
    if (!bw) continue;
    out.push({ date: point.date, value: Math.round((point.best_e1rm_kg / Number(bw.weight_kg)) * 100) / 100, point });
  }
  return out;
}

/** Entries from the last `days` days up to `today`; `null` days means everything. */
export function sinceDays(weights: BodyWeightEntry[], today: string, days: number | null): BodyWeightEntry[] {
  if (days === null) return weights;
  const from = shiftDay(today, -days);
  return weights.filter((w) => w.date >= from);
}
