// Metric selection, series extraction and value formatting for exercise progress.
import type { ExerciseKind, ProgressPoint, UnitSystem } from "../api/types";
import { kgToDisplay, weightLabel } from "./units";

export type MetricId =
  | "e1rm" | "top_weight" | "relative" | "volume"
  | "total_reps" | "top_reps"
  | "best_time" | "total_time"
  | "best_distance" | "total_distance";

export type Quantity = "weight" | "reps" | "time" | "distance" | "ratio";

export interface MetricDef {
  id: MetricId;
  label: string;
  quantity: Quantity;
  /** Totals start the y axis at 0; "best" metrics do not need to. */
  zeroBased: boolean;
  get: (p: ProgressPoint) => number | null;
}

const M: Record<Exclude<MetricId, "relative">, MetricDef> = {
  e1rm: { id: "e1rm", label: "Est. 1RM", quantity: "weight", zeroBased: false, get: (p) => p.best_e1rm_kg },
  top_weight: { id: "top_weight", label: "Top weight", quantity: "weight", zeroBased: false, get: (p) => p.top_weight_kg },
  volume: { id: "volume", label: "Volume", quantity: "weight", zeroBased: true, get: (p) => p.volume_kg },
  total_reps: { id: "total_reps", label: "Total reps", quantity: "reps", zeroBased: true, get: (p) => p.total_reps },
  top_reps: { id: "top_reps", label: "Top reps", quantity: "reps", zeroBased: false, get: (p) => p.top_reps },
  best_time: { id: "best_time", label: "Best time", quantity: "time", zeroBased: false, get: (p) => p.best_duration_s },
  total_time: { id: "total_time", label: "Total time", quantity: "time", zeroBased: true, get: (p) => p.total_duration_s },
  best_distance: { id: "best_distance", label: "Best distance", quantity: "distance", zeroBased: false, get: (p) => p.best_distance_m },
  total_distance: { id: "total_distance", label: "Total distance", quantity: "distance", zeroBased: true, get: (p) => p.total_distance_m },
};

export function metricsFor(kind: ExerciseKind, points: ProgressPoint[]): MetricDef[] {
  switch (kind) {
    case "weight_reps":
      return [M.e1rm, M.top_weight, M.volume];
    case "bodyweight_reps":
      return points.some((p) => p.top_weight_kg !== null)
        ? [M.total_reps, M.top_reps, M.top_weight]
        : [M.total_reps, M.top_reps];
    case "duration":
      return [M.best_time, M.total_time];
    case "distance":
      return [M.best_distance, M.total_distance];
  }
}

export interface SeriesPoint {
  date: string;
  /** In display units (lb for imperial weights); time in s, distance in m. */
  value: number;
  point: ProgressPoint;
}

/** One entry per session that has a value; missing values are skipped, never zero. */
export function seriesFor(points: ProgressPoint[], metric: MetricDef, unit: UnitSystem): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  for (const point of points) {
    const raw = metric.get(point);
    if (raw === null || raw === undefined) continue;
    const value = metric.quantity === "weight" ? kgToDisplay(raw, unit) : raw;
    if (value === null) continue;
    out.push({ date: point.date, value, point });
  }
  return out;
}

/** Index of the best (highest) value; the earliest wins a tie. */
export function bestIndex(series: { value: number }[]): number | null {
  let best: number | null = null;
  series.forEach((s, i) => {
    if (best === null || s.value > series[best].value) best = i;
  });
  return best;
}

const trim = (v: number, d: number): string => Number(v.toFixed(d)).toLocaleString("en-US", { maximumFractionDigits: d });

export function formatTime(s: number): string {
  const t = Math.round(s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export function formatDistance(m: number): string {
  return m >= 1000 ? `${trim(m / 1000, 2)} km` : `${trim(m, 0)} m`;
}

/** A display-unit value with its unit, e.g. "1,240 kg", "1:30", "5.2 km", "24 reps". */
export function formatValue(v: number, q: Quantity, unit: UnitSystem): string {
  switch (q) {
    case "weight":
      return `${trim(v, v >= 100 ? 0 : 1)} ${weightLabel(unit)}`;
    case "reps":
      return `${trim(v, 0)} ${v === 1 ? "rep" : "reps"}`;
    case "time":
      return formatTime(v);
    case "distance":
      return formatDistance(v);
    case "ratio":
      return `${trim(v, 2)}× BW`;
  }
}

/** Axis tick text: no unit for weight and reps (the unit is in the axis caption). */
export function formatTick(v: number, q: Quantity): string {
  switch (q) {
    case "weight":
      return trim(v, 1);
    case "reps":
      return trim(v, 0);
    case "time":
      return formatTime(v);
    case "distance":
      return v >= 1000 ? `${trim(v / 1000, 2)} km` : `${trim(v, 0)} m`;
    case "ratio":
      return trim(v, 2);
  }
}

/** Tick step multiple that keeps duration/distance axes on round minutes / kilometres. */
export function axisUnit(q: Quantity, max: number): number {
  if (q === "time") return max >= 600 ? 60 : 1;
  if (q === "distance") return max >= 5000 ? 1000 : 1;
  return 1;
}
