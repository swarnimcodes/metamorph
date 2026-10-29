import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { useEffect, useMemo, useState } from "react";
import { changeOver, sinceDays, todayIn, trailingAverage } from "../lib/bodyweight";
import { formatDay } from "../lib/format";
import { formatTick, formatValue } from "../lib/progress";
import { toastError } from "../lib/toast";
import { displayToKg, kgToDisplay, weightLabel } from "../lib/units";
import { useAuth } from "../stores/auth";
import { errMsg } from "../stores/auth";
import { useStats } from "../stores/stats";
import { LineChart } from "./LineChart";
import { Sheet } from "./Sheet";

const RECENT = 5;
const RANGES = [
  { id: "3m", label: "3M", days: 91 },
  { id: "1y", label: "1Y", days: 365 },
  { id: "all", label: "All", days: null },
] as const;

export function BodyWeightCard() {
  const user = useAuth((s) => s.user);
  const unit = user?.unit_system ?? "metric";
  const timeZone = user?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { bodyWeights, errors, loadBodyWeights, deleteBodyWeight } = useStats();
  const [open, setOpen] = useState(false);
  const [rangeId, setRangeId] = useState<(typeof RANGES)[number]["id"]>("3m");
  const range = RANGES.find((r) => r.id === rangeId) ?? RANGES[0];

  useEffect(() => {
    void loadBodyWeights();
  }, [loadBodyWeights]);

  const today = todayIn(timeZone);
  const points = useMemo(
    () => sinceDays(bodyWeights ?? [], today, range.days).map((w) => ({ date: w.date, value: kgToDisplay(w.weight_kg, unit) ?? 0 })),
    [bodyWeights, unit, today, range],
  );
  const latest = bodyWeights?.at(-1);
  const avgKg = bodyWeights ? trailingAverage(bodyWeights, today, 7) : null;
  const delta = bodyWeights ? changeOver(bodyWeights, 30) : null;
  const text = (kg: number) => formatValue(kgToDisplay(kg, unit) ?? 0, "weight", unit);
  const deltaText = delta === null ? null : `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${text(Math.abs(delta))}`;

  return (
    <section className="card stack" aria-labelledby="bw-h">
      <div className="bw-head">
        <h2 id="bw-h">Body weight</h2>
        <button className="btn" onClick={() => setOpen(true)}>Log weight</button>
      </div>

      {errors.bodyWeights && !bodyWeights && (
        <p className="error" role="alert">
          {errors.bodyWeights} <button className="link" onClick={() => void loadBodyWeights()}>Retry</button>
        </p>
      )}
      {!bodyWeights && !errors.bodyWeights && <p className="dim">Loading…</p>}
      {bodyWeights && !latest && <p className="dim">Log your weight now and then to see it next to your strength.</p>}

      {bodyWeights && latest && (
        <>
          <dl className="summary bw-summary">
            <div><dd>{text(latest.weight_kg)}</dd><dt>Latest · {formatDay(latest.date, false)}</dt></div>
            <div><dd>{avgKg === null ? "—" : text(avgKg)}</dd><dt>7-day average</dt></div>
            <div><dd>{deltaText ?? "—"}</dd><dt>Last 30 days</dt></div>
          </dl>
          <ToggleGroup
            className="seg"
            value={[range.id]}
            onValueChange={(v) => v[0] && setRangeId(v[0] as typeof rangeId)}
            aria-label="Chart range"
          >
            {RANGES.map((r) => (
              <Toggle key={r.id} value={r.id} className="seg-opt">{r.label}</Toggle>
            ))}
          </ToggleGroup>
          {points.length === 0 && <p className="dim">No weigh-ins in this range.</p>}
          {points.length > 1 && (
            <LineChart
              key={range.id}
              points={points}
              zeroBased={false}
              formatTick={(v) => formatTick(v, "weight")}
              formatValue={(v) => formatValue(v, "weight", unit)}
              label={`Body weight (${weightLabel(unit)})`}
              showBest={false}
              noun="weigh-in"
            />
          )}
          <ul className="rows bw-recent" aria-label="Recent weigh-ins">
            {[...bodyWeights].reverse().slice(0, RECENT).map((w) => (
              <li key={w.date}>
                <span>{formatDay(w.date)}</span>
                <span className="bw-val">{text(w.weight_kg)}</span>
                <button
                  className="icon-btn"
                  aria-label={`Delete weigh-in of ${formatDay(w.date)}`}
                  onClick={() => deleteBodyWeight(w.date).catch((e) => toastError(`Couldn't delete: ${errMsg(e)}`))}
                >
                  <span aria-hidden>✕</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {open && <LogSheet today={today} unit={unit} existing={bodyWeights ?? []} onClose={() => setOpen(false)} />}
    </section>
  );
}

function LogSheet({
  today, unit, existing, onClose,
}: {
  today: string;
  unit: "metric" | "imperial";
  existing: { date: string; weight_kg: number }[];
  onClose: () => void;
}) {
  const logBodyWeight = useStats((s) => s.logBodyWeight);
  const [date, setDate] = useState(today);
  const prefill = (d: string) => {
    const e = existing.find((w) => w.date === d) ?? (d === today ? existing.at(-1) : undefined);
    return e ? String(kgToDisplay(e.weight_kg, unit)) : "";
  };
  const [value, setValue] = useState(prefill(today));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const n = Number(value.replace(",", "."));
  const valid = value.trim() !== "" && Number.isFinite(n) && n > 0 && n < (unit === "imperial" ? 1100 : 500) && date !== "" && date <= today;
  const replaces = existing.some((w) => w.date === date);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await logBodyWeight(date, displayToKg(n, unit));
      onClose();
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title="Log weight">
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !busy) void save();
        }}
      >
        <label className="field">
          Weight ({weightLabel(unit)})
          <input
            inputMode="decimal"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={(e) => e.target.select()}
            enterKeyHint="done"
          />
        </label>
        <label className="field">
          Date
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => {
              setDate(e.target.value);
              const p = prefill(e.target.value);
              if (p) setValue(p);
            }}
          />
        </label>
        {replaces && <p className="dim small">This replaces the weigh-in already logged for that day.</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary big" type="submit" disabled={!valid || busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </form>
    </Sheet>
  );
}
