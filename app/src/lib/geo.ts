import type { Option } from "./typeahead";

/**
 * Countries, states and cities for the gym form. The data lives in public/geo, generated from the
 * country-state-city package by scripts/build-geo.mjs, and is fetched one country at a time: the whole set is
 * megabytes, a country is a few kilobytes. Results are kept for the session.
 */
const BASE = `${import.meta.env.BASE_URL}geo/`;

interface Coded {
  c: string;
  n: string;
}
export type CitiesByState = Record<string, string[]>;

const cache = new Map<string, Promise<unknown>>();

function load<T>(path: string, fallback: T): Promise<T> {
  let p = cache.get(path) as Promise<T> | undefined;
  if (!p) {
    p = fetch(BASE + path)
      .then((r) => (r.ok ? (r.json() as Promise<T>) : fallback))
      // A failed load is not remembered, so reopening the form retries; the form works as plain text meanwhile.
      .catch(() => {
        cache.delete(path);
        return fallback;
      });
    cache.set(path, p);
  }
  return p;
}

const toOptions = (list: Coded[]): Option[] => list.map((x) => ({ value: x.c, label: x.n }));

export const loadCountries = (): Promise<Option[]> => load<Coded[]>("countries.json", []).then(toOptions);

/** States of a country as options whose value is the state's name (that is what a gym stores). */
export const loadStates = (country: string): Promise<Option[]> =>
  load<Coded[]>(`states/${country}.json`, []).then((l) => l.map((s) => ({ value: s.n, label: s.n })));

export const loadCities = (country: string): Promise<CitiesByState> => load<CitiesByState>(`cities/${country}.json`, {});

/** The state's code for its name, which is how the cities are filed. */
export const stateCode = async (country: string, stateName: string): Promise<string | null> => {
  const list = await load<Coded[]>(`states/${country}.json`, []);
  return list.find((s) => s.n === stateName)?.c ?? null;
};

/** City suggestions: the chosen state's, or the whole country's when no state is chosen. */
export function cityOptions(all: CitiesByState, state: string | null): Option[] {
  const names = state !== null && all[state] ? all[state] : [...new Set(Object.values(all).flat())].sort();
  return names.map((n) => ({ value: n, label: n }));
}
