// Builds the location pickers' data from the country-state-city package (a dev dependency: nothing from it is
// shipped). Output goes to public/geo and is committed, so builds do not depend on this running:
//   countries.json          [{ c: "IN", n: "India" }, ...]
//   states/<CC>.json        [{ c: "MH", n: "Maharashtra" }, ...]
//   cities/<CC>.json        { "MH": ["Pune", ...], ... }   keyed by state code; "" for places with no state
// Run `pnpm geo` after upgrading the package. The files are loaded one country at a time.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { City, Country, State } from "country-state-city";

const out = new URL("../public/geo/", import.meta.url).pathname;
rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}states`, { recursive: true });
mkdirSync(`${out}cities`, { recursive: true });

const byName = (a, b) => a.localeCompare(b, "en");
const countries = Country.getAllCountries().map((c) => ({ c: c.isoCode, n: c.name }));
countries.sort((a, b) => byName(a.n, b.n));
writeFileSync(`${out}countries.json`, JSON.stringify(countries));

const cities = City.getAllCities();
const grouped = new Map();
for (const city of cities) {
  const m = grouped.get(city.countryCode) ?? new Map();
  const list = m.get(city.stateCode) ?? new Set();
  list.add(city.name);
  m.set(city.stateCode, list);
  grouped.set(city.countryCode, m);
}

let files = 0;
for (const { c } of countries) {
  const states = State.getStatesOfCountry(c).map((s) => ({ c: s.isoCode, n: s.name }));
  states.sort((a, b) => byName(a.n, b.n));
  if (states.length) writeFileSync(`${out}states/${c}.json`, JSON.stringify(states));
  const m = grouped.get(c);
  if (m) {
    const obj = {};
    for (const [state, set] of m) obj[state ?? ""] = [...set].sort(byName);
    writeFileSync(`${out}cities/${c}.json`, JSON.stringify(obj));
  }
  files++;
}
console.log(`${countries.length} countries, ${cities.length} cities, ${files} country files`);
