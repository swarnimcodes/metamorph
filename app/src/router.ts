import { useSyncExternalStore } from "react";

// Hash routing: gives the back button and reload-resume with no dependency.
export type Route =
  | { name: "home" }
  | { name: "workout"; id: string }
  | { name: "detail"; id: string }
  | { name: "you" }
  | { name: "social" }
  | { name: "stats" }
  | { name: "gym"; id: string }
  | { name: "person"; id: string }
  | { name: "friendWorkout"; id: string; workoutId: string }
  | { name: "notifications" }
  | { name: "reports" }
  | { name: "adminPeople" }
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
  if (parts[0] === "people" && parts[1] && parts[2] === "workouts" && parts[3]) return { name: "friendWorkout", id: parts[1], workoutId: parts[3] };
  if (parts[0] === "people" && parts[1]) return { name: "person", id: parts[1] };
  if (parts[0] === "notifications") return { name: "notifications" };
  if (parts[0] === "reports") return { name: "reports" };
  if (parts[0] === "admin" && parts[1] === "people") return { name: "adminPeople" };
  if (parts[0] === "gyms" && parts[1]) return { name: "gym", id: parts[1] };
  if (parts[0] === "social") return { name: "social" };
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

/** Whether moving to another screen should be animated: only where the browser can, the person hasn't asked for less motion, and it is a real change. */
export function shouldAnimate(o: { supported: boolean; reducedMotion: boolean; same: boolean; replace?: boolean }): boolean {
  return o.supported && !o.reducedMotion && !o.same && !o.replace;
}

type ViewTransitionDocument = Document & { startViewTransition?: (update: () => Promise<void>) => { finished: Promise<void> } };

/**
 * Go to another screen. In browsers with the View Transitions API (Chrome, Android's WebView) the old screen fades
 * out and the new one rises in; anywhere else, or with reduced motion on, it just changes. The back button and a
 * typed address change instantly: the browser gives us no moment to wrap those.
 */
export function navigate(path: string, opts: { replace?: boolean } = {}): void {
  const target = `#${path}`;
  const apply = () => {
    if (opts.replace) window.location.replace(target);
    else window.location.hash = target;
  };
  const doc = document as ViewTransitionDocument;
  const animate = shouldAnimate({
    supported: typeof doc.startViewTransition === "function",
    reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    same: window.location.hash === target,
    replace: opts.replace,
  });
  if (!animate) {
    apply();
    return;
  }
  doc.startViewTransition!(
    () =>
      // The new screen is on the page once the hash changed and React has drawn it, a frame later at most.
      new Promise<void>((resolve) => {
        const done = () => {
          requestAnimationFrame(() => resolve());
          setTimeout(resolve, 80); // a hidden tab pauses animation frames; do not wait for one
        };
        window.addEventListener("hashchange", done, { once: true });
        setTimeout(resolve, 400); // never leave the page frozen if the hash does not change
        apply();
      }),
  );
}

/** Send plain in-app links (`<a href="#/...">`, like the tab bar) through navigate() so they animate too. */
export function installLinkTransitions(): void {
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element | null)?.closest?.("a[href^='#/']");
    if (!a || a.getAttribute("target")) return;
    e.preventDefault();
    navigate(a.getAttribute("href")!.slice(1));
  });
}

export const paths = {
  home: "/",
  you: "/you",
  social: "/social",
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
  gym: (id: string) => `/gyms/${id}`,
  person: (id: string) => `/people/${id}`,
  friendWorkout: (id: string, workoutId: string) => `/people/${id}/workouts/${workoutId}`,
  notifications: "/notifications",
  reports: "/reports",
  adminPeople: "/admin/people",
};
