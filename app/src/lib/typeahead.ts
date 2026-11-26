export interface Option {
  value: string;
  label: string;
}

/** Lower case with accents removed, so "Sao Paulo" finds "São Paulo". */
export const fold = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

/**
 * Options matching what was typed: names that start with it first, then names that contain it, each in the
 * list's own order. Nothing typed lists the first `limit`. Capped because some countries have thousands of cities.
 */
export function filterOptions(options: readonly Option[], query: string, limit = 8): Option[] {
  const q = fold(query);
  if (!q) return options.slice(0, limit);
  const starts: Option[] = [];
  const contains: Option[] = [];
  for (const o of options) {
    const label = fold(o.label);
    if (label.startsWith(q)) starts.push(o);
    else if (label.includes(q)) contains.push(o);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}
