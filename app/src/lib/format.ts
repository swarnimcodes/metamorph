import type { WorkoutSet } from "../api/types";

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

export function formatDate(iso: string): string {
  const d = new Date(iso);
  const opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString(undefined, opts);
}

export const formatTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

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
