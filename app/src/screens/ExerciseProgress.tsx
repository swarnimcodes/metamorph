import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { useEffect, useMemo, useState } from "react";
import type { ExerciseProgress as Progress, ProgressPoint, ProgressRecords, UnitSystem } from "../api/types";
import { LineChart } from "../components/LineChart";
import { relativeStrength } from "../lib/bodyweight";
import { formatDay, plural } from "../lib/format";
import {
  axisUnit, formatDistance, formatTime, formatTick, formatValue, metricsFor, seriesFor, type MetricDef, type MetricId, type Quantity,
} from "../lib/progress";
import { kgToDisplay, weightLabel } from "../lib/units";
import { navigate, paths } from "../router";
import { useAuth } from "../stores/auth";
import { progressKey, useStats } from "../stores/stats";

const kgText = (kg: number, unit: UnitSystem) => formatValue(kgToDisplay(kg, unit) ?? 0, "weight", unit);

function sessionSummary(kind: Progress["kind"], p: ProgressPoint, unit: UnitSystem): string {
  const parts: string[] = [];
  switch (kind) {
    case "weight_reps":
      if (p.top_weight_kg !== null) parts.push(`Top ${kgText(p.top_weight_kg, unit)}`);
      if (p.best_e1rm_kg !== null) parts.push(`1RM ${kgText(p.best_e1rm_kg, unit)}`);
      if (p.volume_kg !== null) parts.push(`Vol ${kgText(p.volume_kg, unit)}`);
      break;
    case "bodyweight_reps":
      if (p.total_reps !== null) parts.push(plural(p.total_reps, "rep"));
      if (p.top_reps !== null) parts.push(`best set ${p.top_reps}`);
      if (p.top_weight_kg !== null) parts.push(`+${kgText(p.top_weight_kg, unit)}`);
      break;
    case "duration":
      if (p.best_duration_s !== null) parts.push(`Best ${formatTime(p.best_duration_s)}`);
      if (p.total_duration_s !== null) parts.push(`Total ${formatTime(p.total_duration_s)}`);
      break;
    case "distance":
      if (p.best_distance_m !== null) parts.push(`Best ${formatDistance(p.best_distance_m)}`);
      if (p.total_distance_m !== null) parts.push(`Total ${formatDistance(p.total_distance_m)}`);
      break;
  }
  return parts.join(" · ") || "—";
}

function recordRows(r: ProgressRecords, unit: UnitSystem): { label: string; value: string; date: string }[] {
  const rows: { label: string; value: string; date: string }[] = [];
  const add = (label: string, rec: { value: number; date: string } | null, fmt: (v: number) => string) => {
    if (rec) rows.push({ label, value: fmt(rec.value), date: rec.date });
  };
  add("Top weight", r.top_weight_kg, (v) => kgText(v, unit));
  add("Best est. 1RM", r.best_e1rm_kg, (v) => kgText(v, unit));
  add("Best session volume", r.best_volume_kg, (v) => kgText(v, unit));
  add("Most reps in a set", r.top_reps, (v) => formatValue(v, "reps", unit));
  add("Longest time", r.best_duration_s, formatTime);
  add("Longest distance", r.best_distance_m, formatDistance);
  return rows;
}

const SHOWN = 15;

const RELATIVE: MetricDef = {
  id: "relative", label: "× Bodyweight", quantity: "ratio", zeroBased: false, get: () => null,
};

export function ExerciseProgress({ id, variant, from }: { id: string; variant: string | null; from: string | null }) {
  const unit = useAuth((s) => s.user?.unit_system ?? "metric");
  const key = progressKey(id, variant);
  const data = useStats((s) => s.progress[key]);
  const error = useStats((s) => s.errors[key]);
  const exercises = useStats((s) => s.exercises);
  const loadProgress = useStats((s) => s.loadProgress);
  const loadExercises = useStats((s) => s.loadExercises);
  const bodyWeights = useStats((s) => s.bodyWeights);
  const loadBodyWeights = useStats((s) => s.loadBodyWeights);
  const [metricId, setMetricId] = useState<MetricId | null>(null);
  const [all, setAll] = useState(false);

  useEffect(() => {
    void loadProgress(id, variant);
  }, [id, variant, loadProgress]);
  useEffect(() => {
    void loadExercises();
  }, [loadExercises]);
  useEffect(() => {
    void loadBodyWeights();
  }, [loadBodyWeights]);

  const variants = useMemo(() => (exercises ?? []).filter((x) => x.exercise_id === id), [exercises, id]);
  const current = variant === null ? null : variants.find((v) => v.variant_key === variant);
  const relative = useMemo(() => (data?.kind === "weight_reps" && bodyWeights ? relativeStrength(data.points, bodyWeights) : []), [data, bodyWeights]);
  const metrics = useMemo(() => {
    const base = data ? metricsFor(data.kind, data.points) : [];
    // Offered once at least one session has a weigh-in on or before it.
    return relative.length > 0 ? [...base, RELATIVE] : base;
  }, [data, relative]);
  const metric = metrics.find((m) => m.id === metricId) ?? metrics[0];
  const series = useMemo(
    () => (data && metric ? (metric.id === "relative" ? relative : seriesFor(data.points, metric, unit)) : []),
    [data, metric, unit, relative],
  );
  const maxValue = series.reduce((a, s) => Math.max(a, s.value), 0);

  const quantity: Quantity = metric?.quantity ?? "reps";
  const caption = metric ? `${metric.label}${quantity === "weight" ? ` (${weightLabel(unit)})` : quantity === "reps" ? " (reps)" : quantity === "ratio" ? " (est. 1RM ÷ bodyweight)" : ""}` : "";

  const subtitle = variant === null
    ? variants.length > 1 ? "All variations" : variants[0]?.variant_label ?? ""
    : current?.variant_label || (variant === "" ? "No variation" : variant);

  const sessions = data ? [...data.points].reverse() : [];
  const records = data ? recordRows(data.records, unit) : [];

  return (
    <main className="screen">
      <button className="btn quiet back" onClick={() => navigate(from ?? paths.stats)}>
        {from?.startsWith("/history/") ? "‹ Workout" : "‹ Progress"}
      </button>
      {error && !data && (
        <p className="error" role="alert">
          {error} <button className="link" onClick={() => void loadProgress(id, variant)}>Retry</button>
        </p>
      )}
      {!data && !error && <p className="dim empty">Loading…</p>}
      {data && (
        <>
          <header className="stack-sm">
            <h1>{data.name}</h1>
            {subtitle && <p className="dim">{subtitle}</p>}
          </header>

          {variants.length > 1 && (
            <label className="field">
              Variation
              <select
                className="select"
                value={variant === null ? "*" : variant}
                onChange={(e) => navigate(paths.exercise(id, e.target.value === "*" ? null : e.target.value, from), { replace: true })}
              >
                <option value="*">All variations</option>
                {variants.map((v) => (
                  <option key={v.variant_key} value={v.variant_key}>{v.variant_label || "No variation"}</option>
                ))}
              </select>
            </label>
          )}

          {data.points.length === 0 ? (
            <p className="dim">Nothing logged for this exercise yet.</p>
          ) : (
            <>
              <section className="card stack" aria-label="Progress chart">
                <ToggleGroup
                  className="seg"
                  value={[metric?.id ?? ""]}
                  onValueChange={(v) => v[0] && setMetricId(v[0] as MetricId)}
                  aria-label="Metric"
                >
                  {metrics.map((m) => (
                    <Toggle key={m.id} value={m.id} className="seg-opt">{m.label}</Toggle>
                  ))}
                </ToggleGroup>
                <p className="dim small">{caption} per session</p>
                {series.length === 0 ? (
                  <p className="dim">No data for this metric.</p>
                ) : (
                  <LineChart
                    key={`${metric?.id}|${key}`}
                    points={series}
                    zeroBased={metric?.zeroBased ?? false}
                    tickUnit={axisUnit(quantity, maxValue)}
                    formatTick={(v) => formatTick(v, quantity)}
                    formatValue={(v) => formatValue(v, quantity, unit)}
                    label={caption}
                  />
                )}
              </section>

              {records.length > 0 && (
                <section className="stack" aria-labelledby="records-h">
                  <h2 id="records-h">Records</h2>
                  <dl className="records card">
                    {records.map((r) => (
                      <div key={r.label}>
                        <dt>{r.label}</dt>
                        <dd>{r.value}</dd>
                        <dd className="dim small">{formatDay(r.date)}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}

              <section className="stack" aria-labelledby="sessions-h">
                <h2 id="sessions-h">Sessions</h2>
                <div className="card table-wrap">
                  <table className="sessions">
                    <thead>
                      <tr><th scope="col">Date</th><th scope="col">Sets</th><th scope="col">Result</th></tr>
                    </thead>
                    <tbody>
                      {(all ? sessions : sessions.slice(0, SHOWN)).map((p) => (
                        <tr key={p.workout_id}>
                          <td>{formatDay(p.date, false)}</td>
                          <td>{p.sets}</td>
                          <td className="dim">{sessionSummary(data.kind, p, unit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!all && sessions.length > SHOWN && (
                  <button className="btn" onClick={() => setAll(true)}>Show all {sessions.length} sessions</button>
                )}
              </section>
            </>
          )}
        </>
      )}
    </main>
  );
}
