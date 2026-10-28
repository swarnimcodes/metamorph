import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Consistency, UnitSystem } from "../api/types";
import { formatDay, plural } from "../lib/format";
import { addDays, buildGrid, type HeatDay } from "../lib/heatmap";
import { kgToDisplay, weightLabel } from "../lib/units";

const PITCH = 15; // --cell + --gap in styles.css
const WEEKDAYS: [number, string][] = [[0, "Mon"], [2, "Wed"], [4, "Fri"]];
const monthName = (m: number) => new Date(Date.UTC(2000, m, 1)).toLocaleDateString(undefined, { month: "short", timeZone: "UTC" });

function describe(d: HeatDay, unit: UnitSystem): string {
  const day = formatDay(d.date);
  if (d.workouts === 0) return `${day}: no workouts`;
  const vol = Math.round(kgToDisplay(d.volume_kg, unit) ?? 0).toLocaleString("en-US");
  return `${day}: ${plural(d.workouts, "workout")}, ${plural(d.sets, "set")}, ${vol} ${weightLabel(unit)}`;
}

export function Heatmap({ data, unit }: { data: Consistency; unit: UnitSystem }) {
  const grid = useMemo(() => buildGrid(data.from, data.to, data.days), [data.from, data.to, data.days]);
  const [selected, setSelected] = useState<string | null>(null);
  const [active, setActive] = useState<string>(data.to);
  const scroller = useRef<HTMLDivElement>(null);
  const cells = useRef(new Map<string, HTMLButtonElement>());

  // Start at the most recent week.
  useLayoutEffect(() => {
    const el = scroller.current;
    // Most recent week, snapped to a whole column so no cell is cut at the left edge.
    if (el) el.scrollLeft = Math.floor((el.scrollWidth - el.clientWidth) / PITCH) * PITCH;
  }, [grid.weeks.length]);

  const byDate = useMemo(() => {
    const m = new Map<string, HeatDay>();
    for (const w of grid.weeks) for (const c of w) if (c) m.set(c.date, c);
    return m;
  }, [grid]);

  const select = (date: string) => {
    setActive(date);
    setSelected(date);
  };

  function onKeyDown(e: React.KeyboardEvent, date: string) {
    const step = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    const next = addDays(date, step);
    if (byDate.has(next)) {
      setActive(next);
      cells.current.get(next)?.focus();
    }
  }

  const t = data.totals;
  const summary =
    `Workout heatmap from ${formatDay(data.from)} to ${formatDay(data.to)}: ${plural(t.workouts, "workout")} on ` +
    `${plural(t.active_days, "day")}. Use the arrow keys to move between days.`;
  const selectedDay = selected ? byDate.get(selected) : undefined;

  return (
    <div className="heat">
      <div className="heat-frame" role="group" aria-label={summary}>
        <div className="heat-wd" aria-hidden="true">
          {WEEKDAYS.map(([row, label]) => (
            <span key={label} style={{ gridRow: row + 1 }}>{label}</span>
          ))}
        </div>
        <div className="heat-scroll" ref={scroller}>
          <div className="heat-content">
            <div className="heat-months" aria-hidden="true">
              {grid.months.map((m) => (
                <span key={m.col} style={{ left: `calc(${m.col} * (var(--cell) + var(--gap)))` }}>{monthName(m.month)}</span>
              ))}
            </div>
            <div className="heat-grid">
              {grid.weeks.flatMap((week, c) =>
                week.map((cell, r) =>
                  cell ? (
                    <button
                      key={cell.date}
                      type="button"
                      ref={(el) => {
                        if (el) cells.current.set(cell.date, el);
                        else cells.current.delete(cell.date);
                      }}
                      className="heat-cell"
                      data-level={cell.level}
                      data-selected={cell.date === selected ? "" : undefined}
                      tabIndex={cell.date === active ? 0 : -1}
                      title={describe(cell, unit)}
                      aria-label={describe(cell, unit)}
                      onFocus={() => select(cell.date)}
                      onClick={() => select(cell.date)}
                      onKeyDown={(e) => onKeyDown(e, cell.date)}
                    />
                  ) : (
                    <span key={`${c}-${r}`} aria-hidden="true" />
                  ),
                ),
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="heat-foot">
        <p className="small heat-readout" aria-live="polite">
          {selectedDay ? describe(selectedDay, unit) : <span className="dim">Select a day for details.</span>}
        </p>
        <div className="heat-key dim small" aria-hidden="true">
          Less
          {[0, 1, 2, 3].map((l) => <span key={l} className="heat-swatch" data-level={l} />)}
          More
        </div>
      </div>
    </div>
  );
}
