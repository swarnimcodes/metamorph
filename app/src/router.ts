import { useSyncExternalStore } from "react";

// Hash routing: gives the back button and reload-resume with no dependency.
export type Route =
  | { name: "home" }
  | { name: "workout"; id: string }
  | { name: "detail"; id: string }
  | { name: "you" }
  | { name: "stats" }
  | {
      name: "exercise";
      id: string;
      /** null = all variations, "" = untagged */
      variant: string | null;
      /** Where "back" returns to when the screen was opened from elsewhere (a workout); null = Progress. */
      from: string | null;
    };

/** Only in-app screens a progress page is opened from; anything else in the hash is ignored. */
const FROM_PATTERN = /^\/(history\/[0-9a-f-]{36}|stats)$/i;

export function parseRoute(hash: string): Route {
  const [pathPart, query = ""] = hash.replace(/^#\/?/, "").split("?");
  const parts = pathPart.split("/");
  if (parts[0] === "stats" && parts[1] === "exercise" && parts[2]) {
    const q = new URLSearchParams(query);
    const from = q.get("from");
    return {
      name: "exercise",
      id: parts[2],
      variant: q.has("v") ? q.get("v") : null,
      from: from && FROM_PATTERN.test(from) ? from : null,
    };
  }
  if (parts[0] === "stats") return { name: "stats" };
  if (parts[0] === "workout" && parts[1]) return { name: "workout", id: parts[1] };
  if (parts[0] === "history" && parts[1]) return { name: "detail", id: parts[1] };
  if (parts[0] === "you" || parts[0] === "settings") return { name: "you" };
  return { name: "home" };
}

function subscribe(cb: () => void): () => void {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

const snapshot = () => window.location.hash;

export function useRoute(): Route {
  return parseRoute(useSyncExternalStore(subscribe, snapshot));
}

export function navigate(path: string, opts: { replace?: boolean } = {}): void {
  const target = `#${path}`;
  if (opts.replace) window.location.replace(target);
  else window.location.hash = target;
}

export const paths = {
  home: "/",
  you: "/you",
  stats: "/stats",
  exercise: (id: string, variant: string | null, from?: string | null) => {
    const q = new URLSearchParams();
    if (variant !== null) q.set("v", variant);
    if (from) q.set("from", from);
    const query = q.toString();
    return `/stats/exercise/${id}${query ? `?${query}` : ""}`;
  },
  workout: (id: string) => `/workout/${id}`,
  detail: (id: string) => `/history/${id}`,
};
