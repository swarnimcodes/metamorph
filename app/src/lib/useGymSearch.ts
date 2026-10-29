import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Gym } from "../api/types";
import { errMsg } from "../stores/auth";
import { toastError } from "./toast";

/** Debounced gym search; an empty query lists gyms with the ones you trained at first. `reload` re-runs it. */
export function useGymSearch(q: string, enabled = true) {
  const [found, setFound] = useState<Gym[]>([]);
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let stale = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await api.searchGyms(q.trim());
        if (!stale) setFound(r);
      } catch (e) {
        if (!stale) toastError(`Couldn't search gyms: ${errMsg(e)}`);
      } finally {
        if (!stale) setLoading(false);
      }
    }, q ? 250 : 0);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [q, enabled, nonce]);

  return { found, loading, reload: () => setNonce((n) => n + 1) };
}
