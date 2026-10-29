import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "../api/client";

/**
 * The cache policy, in one place. The aim is "slow beats wrong":
 *  - cached data is shown at once, but user data is stale the moment it is cached (staleTime 0), so
 *    every screen that mounts, every return to the app and every reconnect re-checks the server;
 *  - changes to data invalidate what they affect (see invalidate.ts) rather than waiting for a timer;
 *  - only reference data that rarely changes gets a longer staleTime, set where it is declared;
 *  - the cache lives in memory only and is wiped on sign-out, so nothing outlives a session or leaks
 *    to the next person who signs in.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 0,
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        // A 4xx will not get better by asking again; a dropped connection might.
        retry: (count, error) => count < 1 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
      },
      mutations: { retry: false },
    },
  });
}

export const queryClient = createQueryClient();
