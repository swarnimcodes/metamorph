import { useEffect, useMemo, useRef, useState } from "react";
import { formatDay } from "../lib/format";
import { linear, nearestIndex, timeTicks, yScale } from "../lib/chart";
import { parseDate } from "../lib/heatmap";

export interface ChartPoint {
  date: string;
  value: number;
}

interface Props {
  points: ChartPoint[];
  zeroBased: boolean;
  /** Tick text for the y axis. */
  formatTick: (v: number) => string;
  /** Full value text, with unit, for labels and the readout. */
  formatValue: (v: number) => string;
  /** Step multiple for y ticks (e.g. 60 to land on whole minutes). */
  tickUnit?: number;
  /** Short caption naming metric and unit, also the accessible name. */
  label: string;
  /** Mark the highest point. Off for series where higher is not "better" (bodyweight). */
  showBest?: boolean;
  /** What one point is called in the accessible name and hint. */
  noun?: string;
}

const HEIGHT = 220;
const M = { top: 42, right: 16, bottom: 28 };

function useWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [w, setW] = useState(340);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth || 340);
    const ro = new ResizeObserver(() => setW(el.clientWidth || 340));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

export function LineChart({ points, zeroBased, formatTick, formatValue, tickUnit = 1, label, showBest = true, noun = "session" }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const width = useWidth(wrap);
  const [sel, setSel] = useState<number | null>(null);
  const n = points.length;

  const best = useMemo(() => {
    let b = 0;
    points.forEach((p, i) => {
      if (p.value > points[b].value) b = i;
    });
    return b;
  }, [points]);

  const y = useMemo(() => yScale(points.map((p) => p.value), zeroBased, 5, tickUnit), [points, zeroBased, tickUnit]);
  const left = 12 + Math.max(...y.ticks.map((t) => formatTick(t).length), 2) * 6.6;
  const t0 = n ? parseDate(points[0].date) : 0;
  const t1 = n ? parseDate(points[n - 1].date) : 0;
  const innerBottom = HEIGHT - M.bottom;
  const sx = linear(t0, t1, left + 6, width - M.right);
  const sy = linear(y.min, y.max, innerBottom, M.top);
  const xs = points.map((p) => sx(parseDate(p.date)));
  const spanYears = n ? new Date(t1).getUTCFullYear() !== new Date(t0).getUTCFullYear() : false;
  const xTicks = n ? timeTicks(t0, t1, width < 400 ? 3 : 4) : [];
  const tickText = (ms: number) =>
    new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: spanYears ? "2-digit" : undefined, timeZone: "UTC" });

  const path = points.map((_, i) => `${i === 0 ? "M" : "L"}${xs[i].toFixed(1)} ${sy(points[i].value).toFixed(1)}`).join("");
  const showDots = n <= 60;

  function labelProps(i: number, above: boolean) {
    const x = xs[i];
    const py = sy(points[i].value);
    const anchor = x < left + 50 ? "start" : x > width - 60 ? "end" : "middle";
    return { x: anchor === "start" ? x - 4 : anchor === "end" ? x + 4 : x, y: above ? py - 12 : py + 20, anchor: anchor as "start" | "middle" | "end" };
  }
  const bestAbove = sy(points[best]?.value ?? 0) > 26;
  const last = n - 1;
  const lastAbove = last === best ? bestAbove : sy(points[last]?.value ?? 0) < innerBottom - 26 ? false : true;
  const lastClash = showBest && last !== best && Math.abs(xs[last] - xs[best]) < 90 && lastAbove === bestAbove;

  function onKeyDown(e: React.KeyboardEvent) {
    const cur = sel ?? n - 1;
    let next: number | null = null;
    if (e.key === "ArrowLeft") next = Math.max(0, cur - 1);
    else if (e.key === "ArrowRight") next = Math.min(n - 1, cur + 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    if (next === null) return;
    e.preventDefault();
    setSel(next);
  }

  function onPointer(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    setSel(nearestIndex(xs, e.clientX - rect.left));
  }

  const shown = sel !== null ? points[sel] : null;
  const bp = points[best];

  return (
    <div className="linechart" ref={wrap}>
      <div
        className="linechart-focus"
        tabIndex={0}
        role="group"
        aria-label={`${label}: ${n} ${noun}s.${showBest ? ` Best ${bp ? formatValue(bp.value) + " on " + formatDay(bp.date) : "none"}.` : ""} Use left and right arrow keys to read each ${noun}.`}
        onKeyDown={onKeyDown}
        onFocus={() => setSel((s) => s ?? n - 1)}
      >
        <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} onPointerDown={onPointer} onPointerMove={(e) => e.pointerType === "mouse" && onPointer(e)} aria-hidden="true">
          {y.ticks.map((t) => (
            <g key={t}>
              <line className="chart-grid" x1={left} x2={width - M.right} y1={sy(t)} y2={sy(t)} />
              <text className="chart-tick" x={left - 8} y={sy(t)} textAnchor="end" dominantBaseline="central">{formatTick(t)}</text>
            </g>
          ))}
          {xTicks.map((t, i) => (
            <text
              key={t}
              className="chart-tick"
              x={Math.min(Math.max(sx(t), left + 14), width - 20)}
              y={HEIGHT - 8}
              textAnchor={i === 0 && n > 1 ? "start" : i === xTicks.length - 1 && n > 1 ? "end" : "middle"}
              {...(i === 0 && n > 1 ? { x: left + 6 } : i === xTicks.length - 1 && n > 1 ? { x: width - M.right } : {})}
            >
              {tickText(t)}
            </text>
          ))}
          {n > 1 && <path className="chart-line" d={path} fill="none" />}
          {sel !== null && <line className="chart-guide" x1={xs[sel]} x2={xs[sel]} y1={M.top - 6} y2={innerBottom} />}
          {points.map((p, i) =>
            showDots || i === best || i === last ? <circle key={i} className="chart-dot" cx={xs[i]} cy={sy(p.value)} r={3.5} /> : null,
          )}
          {showBest && bp && <circle className="chart-best" cx={xs[best]} cy={sy(bp.value)} r={7} fill="none" />}
          {showBest && bp && (
            <text className="chart-label" {...(() => { const l = labelProps(best, bestAbove); return { x: l.x, y: l.y, textAnchor: l.anchor }; })()}>
              {`Best ${formatValue(bp.value)}`}
            </text>
          )}
          {n > 0 && (!showBest || last !== best) && (
            <text className="chart-label dim" {...(() => { const l = labelProps(last, lastClash ? !lastAbove : lastAbove); return { x: l.x, y: l.y, textAnchor: l.anchor }; })()}>
              {formatValue(points[last].value)}
            </text>
          )}
          {sel !== null && <circle className="chart-sel" cx={xs[sel]} cy={sy(points[sel].value)} r={5} />}
        </svg>
      </div>
      <p className="small chart-readout" aria-live="polite">
        {shown ? `${formatDay(shown.date)}: ${formatValue(shown.value)}` : <span className="dim">Tap or move along the line to read a {noun}.</span>}
      </p>
    </div>
  );
}
