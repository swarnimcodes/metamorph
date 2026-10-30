import type { WorkoutSet } from "../api/types";
import { deviceTimeZone } from "./timezone";

export function formatElapsed(fromIso: string, toMs: number): string {
  const s = Math.max(0, Math.floor((toMs - new Date(fromIso).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

export function formatDuration(startIso: string, endIso: string): string {
  const mins = Math.max(0, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000));
  return mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;
}

/**
 * The date of a moment as it was where it happened. Pass the workout's own `timeZone`: without one the
 * device's current zone is used, which is wrong for a workout done somewhere else.
 */
export function formatDate(iso: string, timeZone?: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const year = (x: Date) => Number(new Intl.DateTimeFormat("en", { year: "numeric", timeZone }).format(x));
  const opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", timeZone };
  if (year(d) !== year(now)) opts.year = "numeric";
  return d.toLocaleDateString(undefined, opts);
}

/**
 * The clock time as it was where it happened. When that is not where the device is now, the zone's short
 * name is added ("9:00 PM PST"), so a workout from a trip does not read as if it happened at home.
 */
export function formatTime(iso: string, timeZone?: string, deviceZone: string = deviceTimeZone()): string {
  const elsewhere = !!timeZone && timeZone !== deviceZone;
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    ...(elsewhere ? { timeZoneName: "short" } : {}),
  });
}

export const plural = (n: number, one: string, many = one + "s"): string => `${n} ${n === 1 ? one : many}`;

export const hasValues = (s: WorkoutSet): boolean =>
  s.weight_kg !== null || s.reps !== null || s.duration_s !== null || s.distance_m !== null;

import type { UnitSystem } from "../api/types";
import { formatWeight } from "./units";

/** "40 kg × 8", "12 reps", "45 s", "1000 m · 4:10" — independent of exercise kind. */
export function formatSet(s: WorkoutSet, unit: UnitSystem): string {
  const parts: string[] = [];
  const w = s.weight_kg !== null ? formatWeight(s.weight_kg, unit) : "";
  if (w && s.reps !== null) parts.push(`${w} × ${s.reps}`);
  else if (w) parts.push(w);
  else if (s.reps !== null) parts.push(plural(s.reps, "rep"));
  if (s.distance_m !== null) parts.push(`${Number(s.distance_m)} m`);
  if (s.duration_s !== null) parts.push(`${s.duration_s} s`);
  if (s.rir !== null) parts.push(`RIR ${s.rir >= 5 ? "5+" : s.rir}`);
  return parts.join(" · ");
}

/** "Wed 28 Oct 2026" from a "YYYY-MM-DD" calendar date (no timezone shift). */
export function formatDay(date: string, withYear = true): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    weekday: "short", day: "numeric", month: "short", year: withYear ? "numeric" : undefined, timeZone: "UTC",
  });
}
