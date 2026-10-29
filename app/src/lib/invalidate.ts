import type { QueryClient } from "@tanstack/react-query";
import { queryClient } from "./queryClient";
import { keys } from "./queryKeys";

/**
 * What each kind of change makes stale. This file is the whole invalidation policy: a screen that
 * changes data calls one of these instead of deciding for itself what else to refresh.
 *
 * invalidateQueries marks matching queries stale and refetches the ones currently on screen; the rest
 * refetch the next time they are used. So calling these after every set edit costs almost nothing
 * while you are on the workout screen, and the charts are still right when you open them.
 */

/**
 * A workout, or anything in it, changed (started, renamed, gym changed, exercise or set added, edited
 * or removed, finished, deleted). History rows carry exercise and set counts, every stats chart is
 * computed from sets, and "last time" hints come from the previous session.
 */
export function workoutChanged(client: QueryClient = queryClient): Promise<void> {
  return Promise.all([
    client.invalidateQueries({ queryKey: keys.workouts.all }),
    client.invalidateQueries({ queryKey: keys.stats.all }),
    client.invalidateQueries({ queryKey: keys.lastSession.all }),
  ]).then(() => undefined);
}

/** A weigh-in was added, replaced or deleted. The relative-strength chart reads these too, but derives them client-side. */
export function bodyWeightChanged(client: QueryClient = queryClient): Promise<void> {
  return client.invalidateQueries({ queryKey: keys.bodyWeights });
}

/**
 * A gym was created. Gym search results and the gym on past workouts both name gyms, but an existing
 * workout's gym does not change when another one is added, so only searches refresh.
 */
export function gymChanged(client: QueryClient = queryClient): Promise<void> {
  return client.invalidateQueries({ queryKey: keys.gyms.all });
}

/** Sign-out or a different account: nothing cached may survive. */
export function clearAll(client: QueryClient = queryClient): void {
  client.clear();
}
