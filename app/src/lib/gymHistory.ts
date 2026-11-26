import type { GymChange, GymEdit } from "../api/types";

const FIELD_LABEL: Record<string, string> = {
  name: "Name",
  chain: "Chain",
  area: "Area",
  address: "Address",
  city: "City",
  state: "State",
  country_code: "Country",
  maps_url: "Maps link",
};
const ORDER = Object.keys(FIELD_LABEL);

let regionNames: Intl.DisplayNames | null | undefined;
/** "IN" -> "India"; the code itself where the browser has no names. */
export function countryName(code: string): string {
  if (regionNames === undefined) {
    try {
      regionNames = new Intl.DisplayNames(undefined, { type: "region" });
    } catch {
      regionNames = null;
    }
  }
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

/** What an entry was, when it is more than a list of changed fields. */
export function editTitle(edit: Pick<GymEdit, "kind" | "changes">): string | null {
  switch (edit.kind) {
    case "verify":
      return "Marked verified";
    case "unverify":
      return "Verification removed";
    case "delete":
      return "Deleted";
    case "revert":
      return "Reverted an edit";
    case "merge": {
      const from = edit.changes.merged_gym?.from;
      return from ? `Merged in “${from}”` : "Merged a duplicate";
    }
    default:
      return null;
  }
}

/** One edit as lines: "City: Pune → Pune City", "Chain added: Cult", "State removed". */
export function describeEdit(edit: Pick<GymEdit, "kind" | "changes">): string[] {
  if (edit.kind !== "edit" && edit.kind !== "revert") return [];
  const show = (field: string, v: string) => (field === "country_code" ? countryName(v) : v);
  const line = (field: string, c: GymChange): string => {
    const label = FIELD_LABEL[field] ?? field;
    if (c.from !== null && c.to !== null) return `${label}: ${show(field, c.from)} → ${show(field, c.to)}`;
    if (c.to !== null) return `${label} added: ${show(field, c.to)}`;
    return `${label} removed`;
  };
  return Object.entries(edit.changes)
    .sort(([a], [b]) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99))
    .map(([field, c]) => line(field, c));
}

/** "Maharashtra · India" style place line for the gym page, skipping what is missing. */
export function placeLine(g: { area: string | null; city: string | null; state: string | null; country_code: string | null }): string {
  return [g.area, g.city, g.state, g.country_code ? countryName(g.country_code) : null].filter(Boolean).join(" · ");
}
