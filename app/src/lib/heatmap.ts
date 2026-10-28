// Pure layout helpers for the consistency heatmap. Dates are "YYYY-MM-DD"
// strings handled as UTC midnights so there is no timezone or DST drift.
import type { ConsistencyDay } from "../api/types";

const DAY_MS = 86_400_000;

export const parseDate = (s: string): number => {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

export const toDateStr = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export const addDays = (s: string, n: number): string => toDateStr(parseDate(s) + n * DAY_MS);

/** Monday = 0 ... Sunday = 6. */
export const weekdayIndex = (s: string): number => (new Date(parseDate(s)).getUTCDay() + 6) % 7;

export type Level = 0 | 1 | 2 | 3;

/** Workouts per day -> intensity bucket: 0, 1, 2, 3+. */
export const intensity = (workouts: number): Level => (workouts <= 0 ? 0 : workouts >= 3 ? 3 : (workouts as Level));

export interface HeatDay {
  date: string;
  workouts: number;
  sets: number;
  volume_kg: number;
  level: Level;
}

export interface MonthLabel {
  col: number;
  /** 0-11 */
  month: number;
}

export interface HeatGrid {
  /** One array per week (column), 7 rows Mon..Sun; null for days after `to` (or before `from`). */
  weeks: (HeatDay | null)[][];
  months: MonthLabel[];
}

export function buildGrid(from: string, to: string, days: ConsistencyDay[]): HeatGrid {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const start = addDays(from, -weekdayIndex(from));
  const total = Math.floor((parseDate(to) - parseDate(start)) / DAY_MS) + 1;
  const nWeeks = Math.max(0, Math.ceil(total / 7));

  const weeks: (HeatDay | null)[][] = [];
  for (let c = 0; c < nWeeks; c++) {
    const col: (HeatDay | null)[] = [];
    for (let r = 0; r < 7; r++) {
      const date = addDays(start, c * 7 + r);
      if (date < from || date > to) {
        col.push(null);
        continue;
      }
      const d = byDate.get(date);
      col.push({
        date,
        workouts: d?.workouts ?? 0,
        sets: d?.sets ?? 0,
        volume_kg: d?.volume_kg ?? 0,
        level: intensity(d?.workouts ?? 0),
      });
    }
    weeks.push(col);
  }

  // A month is labelled above the week that contains its 1st.
  const months: MonthLabel[] = [];
  weeks.forEach((col, c) => {
    for (const cell of col) {
      if (cell && cell.date.endsWith("-01")) months.push({ col: c, month: Number(cell.date.slice(5, 7)) - 1 });
    }
  });
  // Label the first column's month too, unless the next label is right behind it.
  if (weeks.length > 0 && (months.length === 0 || months[0].col >= 3)) {
    const first = weeks[0].find((x) => x !== null);
    if (first) months.unshift({ col: 0, month: Number(first.date.slice(5, 7)) - 1 });
  }
  return { weeks, months };
}
