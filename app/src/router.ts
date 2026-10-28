import { useSyncExternalStore } from "react";

// Hash routing: gives the back button and reload-resume with no dependency.
export type Route =
  | { name: "home" }
  | { name: "workout"; id: string }
  | { name: "detail"; id: string }
  | { name: "settings" };

function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/");
  if (parts[0] === "workout" && parts[1]) return { name: "workout", id: parts[1] };
  if (parts[0] === "history" && parts[1]) return { name: "detail", id: parts[1] };
  if (parts[0] === "settings") return { name: "settings" };
  return { name: "home" };
}

function subscribe(cb: () => void): () => void {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

const snapshot = () => window.location.hash;

export function useRoute(): Route {
  return parse(useSyncExternalStore(subscribe, snapshot));
}

export function navigate(path: string, opts: { replace?: boolean } = {}): void {
  const target = `#${path}`;
  if (opts.replace) window.location.replace(target);
  else window.location.hash = target;
}

export const paths = {
  home: "/",
  settings: "/settings",
  workout: (id: string) => `/workout/${id}`,
  detail: (id: string) => `/history/${id}`,
};
