import { gymChanged } from "./invalidate";
import { useGymSearchQuery } from "./queries";

/** Gym search for the pickers; `reload` re-runs it, for after a gym has been added. */
export function useGymSearch(q: string, enabled = true) {
  const { found, loading, error, retry } = useGymSearchQuery(q, enabled);
  return { found, loading, error, retry, reload: () => void gymChanged() };
}
