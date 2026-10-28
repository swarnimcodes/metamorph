// Scale helpers for the hand-rolled SVG line chart.

/** Classic "nice number" (Heckbert): 1, 2, 5 x 10^k. */
export function niceNum(range: number, round: boolean): number {
  if (range <= 0) return 1;
  const exp = Math.floor(Math.log10(range));
  const f = range / 10 ** exp;
  let nf: number;
  if (round) nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
  else nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * 10 ** exp;
}

export interface Scale {
  min: number;
  max: number;
  step: number;
  ticks: number[];
}

const clean = (v: number): number => Number(v.toPrecision(12));

/**
 * Round [lo, hi] outward to tick marks on a nice step. `unit` forces the step
 * to be a multiple of a natural unit (e.g. 60 for seconds shown as minutes).
 */
export function niceScale(lo: number, hi: number, maxTicks = 5, unit = 1): Scale {
  if (lo > hi) [lo, hi] = [hi, lo];
  if (lo === hi) {
    const pad = Math.abs(lo) * 0.1 || unit;
    lo -= pad;
    hi += pad;
  }
  const l = lo / unit;
  const h = hi / unit;
  let step = niceNum(niceNum(h - l, false) / Math.max(1, maxTicks - 1), true);
  let min = Math.floor(l / step) * step;
  let max = Math.ceil(h / step) * step;
  // Rounding outward can add a tick; step up to the next nice step to stay within maxTicks.
  while (Math.round((max - min) / step) + 1 > maxTicks) {
    step = niceNum(step * 1.5, true);
    min = Math.floor(l / step) * step;
    max = Math.ceil(h / step) * step;
  }
  const ticks: number[] = [];
  for (let v = min; v <= max + step / 1e6; v += step) ticks.push(clean(v * unit));
  return { min: clean(min * unit), max: clean(max * unit), step: clean(step * unit), ticks };
}

/**
 * Y scale for a series. Totals/volumes start at 0; "best" style metrics get
 * headroom below the lowest value so the line is not squashed against the top.
 */
export function yScale(values: number[], zeroBased: boolean, maxTicks = 5, unit = 1): Scale {
  if (values.length === 0) return niceScale(0, 1, maxTicks, unit);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (zeroBased) return niceScale(Math.min(0, lo), hi, maxTicks, unit);
  const pad = (hi - lo) * 0.2;
  const low = lo - pad;
  return niceScale(lo >= 0 && low < 0 ? 0 : low, hi + (hi - lo) * 0.05, maxTicks, unit);
}

export function linear(d0: number, d1: number, r0: number, r1: number): (v: number) => number {
  if (d0 === d1) return () => (r0 + r1) / 2;
  return (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
}

/** Evenly spaced tick times (ms) between first and last, snapped to whole days. */
export function timeTicks(first: number, last: number, count = 4): number[] {
  const DAY = 86_400_000;
  if (last <= first || count < 2) return [first];
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = Math.round((first + ((last - first) * i) / (count - 1)) / DAY) * DAY;
    if (out[out.length - 1] !== t) out.push(t);
  }
  return out;
}

/** Index of the x closest to `x` (xs ascending). */
export function nearestIndex(xs: number[], x: number): number {
  let best = 0;
  for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - x) < Math.abs(xs[best] - x)) best = i;
  return best;
}
