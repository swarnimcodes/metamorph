import { useEffect, useMemo, useState } from "react";
import type { Gym, GymUpdate } from "../api/types";
import { cityOptions, loadCities, loadCountries, loadStates, stateCode, type CitiesByState } from "../lib/geo";
import { useGymChains } from "../lib/queries";
import type { Option } from "../lib/typeahead";
import { Typeahead } from "./Typeahead";

/** What the form edits: every field is a string; blank means "none". */
export interface GymFormValues {
  name: string;
  chain: string;
  area: string;
  address: string;
  city: string;
  state: string;
  country_code: string;
  maps_url: string;
}

export const emptyGymForm = (name = ""): GymFormValues => ({
  name, chain: "", area: "", address: "", city: "", state: "", country_code: "", maps_url: "",
});

export const gymToForm = (g: Gym): GymFormValues => ({
  name: g.name,
  chain: g.chain ?? "",
  area: g.area ?? "",
  address: g.address ?? "",
  city: g.city ?? "",
  state: g.state ?? "",
  country_code: g.country_code ?? "",
  maps_url: g.maps_url ?? "",
});

/** Only what differs from `before`, trimmed; a field emptied by the user is sent blank, which clears it. */
export function formDiff(before: GymFormValues, after: GymFormValues): GymUpdate {
  const out: GymUpdate = {};
  for (const k of Object.keys(after) as (keyof GymFormValues)[]) {
    const v = after[k].trim();
    if (v !== before[k].trim()) out[k] = v;
  }
  return out;
}

/** The fields of a gym: used for adding one and for editing one. */
export function GymForm({ value, onChange }: { value: GymFormValues; onChange: (v: GymFormValues) => void }) {
  const set = (patch: Partial<GymFormValues>) => onChange({ ...value, ...patch });
  const [countries, setCountries] = useState<Option[]>([]);
  const [states, setStates] = useState<Option[]>([]);
  const [cities, setCities] = useState<CitiesByState>({});
  const [code, setCode] = useState<string | null>(null);
  const chains = useGymChains();

  useEffect(() => {
    let live = true;
    void loadCountries().then((c) => live && setCountries(c));
    return () => {
      live = false;
    };
  }, []);

  const country = value.country_code;
  useEffect(() => {
    let live = true;
    setStates([]);
    setCities({});
    if (country) {
      void loadStates(country).then((s) => live && setStates(s));
      void loadCities(country).then((c) => live && setCities(c));
    }
    return () => {
      live = false;
    };
  }, [country]);

  // Cities are filed under the state's code, the gym stores its name.
  useEffect(() => {
    let live = true;
    setCode(null);
    if (country && value.state) void stateCode(country, value.state).then((c) => live && setCode(c));
    return () => {
      live = false;
    };
  }, [country, value.state]);

  const cityList = useMemo(() => cityOptions(cities, code), [cities, code]);
  const chainList = useMemo(() => chains.map((c) => ({ value: c, label: c })), [chains]);

  return (
    <>
      <label className="field">
        <span>Name</span>
        <input value={value.name} required maxLength={200} onChange={(e) => set({ name: e.target.value })} />
      </label>
      <Typeahead label="Chain (optional)" mode="free" options={chainList} value={value.chain} onChange={(chain) => set({ chain })} placeholder="e.g. Cult, Gold's Gym" />
      <Typeahead
        label="Country (optional)"
        mode="pick"
        options={countries}
        value={value.country_code}
        // A different country makes the old state and city meaningless.
        onChange={(country_code) => set(country_code === value.country_code ? {} : { country_code, state: "", city: "" })}
      />
      {/* No states in the data for some countries: then there is nothing to pick, and no field. */}
      {(states.length > 0 || value.state) && (
        <Typeahead
          label="State (optional)"
          mode="pick"
          options={states.length ? states : [{ value: value.state, label: value.state }]}
          value={value.state}
          onChange={(state) => set(state === value.state ? {} : { state, city: "" })}
        />
      )}
      <Typeahead label="City (optional)" mode="free" options={cityList} value={value.city} onChange={(city) => set({ city })} />
      <label className="field">
        <span>Area (optional)</span>
        <input value={value.area} maxLength={200} placeholder="Neighbourhood, e.g. Aundh" onChange={(e) => set({ area: e.target.value })} />
      </label>
      <label className="field">
        <span>Address (optional)</span>
        <input value={value.address} maxLength={200} onChange={(e) => set({ address: e.target.value })} />
      </label>
      <label className="field">
        <span>Google Maps link (optional)</span>
        <input type="url" inputMode="url" placeholder="https://maps.app.goo.gl/…" value={value.maps_url} onChange={(e) => set({ maps_url: e.target.value })} />
      </label>
    </>
  );
}
