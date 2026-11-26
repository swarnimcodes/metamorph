import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { BodyWeightEntry, WorkoutSummary } from "../api/types";
import { errMsg } from "../stores/auth";
import { bodyWeightChanged } from "./invalidate";
import { queryClient } from "./queryClient";
import { keys } from "./queryKeys";

const HISTORY_PAGE = 20;
/** Reference data that only changes with a server release: worth keeping a while, unlike anything a user edits. */
const REFERENCE_STALE_MS = 30 * 60_000;
const SEARCH_STALE_MS = 5 * 60_000;

const message = (e: unknown): string | null => (e ? errMsg(e) : null);

/** A value that follows `value` after `ms`, immediately when `ms` is 0. */
export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    if (ms <= 0) {
      setV(value);
      return;
    }
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// ---- workouts ----

/** Newest first, paged by the last workout's start time. Pages are merged without duplicates. */
export function useHistory() {
  const q = useInfiniteQuery({
    queryKey: keys.workouts.list(),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api.listWorkouts(pageParam, HISTORY_PAGE),
    getNextPageParam: (last) => (last.length === HISTORY_PAGE ? last.at(-1)?.started_at : undefined),
  });
  const items = useMemo(() => {
    const seen = new Set<string>();
    const out: WorkoutSummary[] = [];
    for (const w of q.data?.pages.flat() ?? []) {
      if (!seen.has(w.id)) {
        seen.add(w.id);
        out.push(w);
      }
    }
    return out;
  }, [q.data]);
  return {
    items,
    /** True until the first page has arrived: show a loading state, not an empty one. */
    pending: q.isPending,
    hasMore: q.hasNextPage,
    loadMore: () => void q.fetchNextPage(),
    loadingMore: q.isFetchingNextPage,
    error: q.isError && items.length === 0 ? message(q.error) : null,
    retry: () => void q.refetch(),
  };
}

export function useWorkoutDetail(id: string) {
  const q = useQuery({ queryKey: keys.workouts.detail(id), queryFn: () => api.getWorkout(id) });
  return { workout: q.data ?? null, error: q.isError && !q.data ? message(q.error) : null, retry: () => void q.refetch() };
}

// ---- stats ----

export function useConsistency() {
  const q = useQuery({ queryKey: keys.stats.consistency(), queryFn: () => api.consistency() });
  return { data: q.data ?? null, error: q.isError && !q.data ? message(q.error) : null, retry: () => void q.refetch() };
}

export function useStatsExercises() {
  const q = useQuery({ queryKey: keys.stats.exercises(), queryFn: () => api.statsExercises() });
  return { data: q.data ?? null, error: q.isError && !q.data ? message(q.error) : null, retry: () => void q.refetch() };
}

export function useProgress(exerciseId: string, variant: string | null) {
  const q = useQuery({
    queryKey: keys.stats.progress(exerciseId, variant),
    queryFn: () => api.exerciseProgress(exerciseId, variant ?? undefined),
  });
  return { data: q.data ?? null, error: q.isError && !q.data ? message(q.error) : null, retry: () => void q.refetch() };
}

// ---- body weight ----

export function useBodyWeights() {
  const q = useQuery({ queryKey: keys.bodyWeights, queryFn: () => api.bodyWeights() });
  return { data: q.data ?? null, error: q.isError && !q.data ? message(q.error) : null, retry: () => void q.refetch() };
}

const byDate = (a: BodyWeightEntry, b: BodyWeightEntry) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

/** Saves, shows it straight away, then refetches so the server's copy is what stays. Throws on failure. */
export async function logBodyWeight(date: string, kg: number): Promise<void> {
  const saved = await api.logBodyWeight(date, kg);
  queryClient.setQueryData<BodyWeightEntry[]>(keys.bodyWeights, (old) =>
    [...(old ?? []).filter((w) => w.date !== saved.date), saved].sort(byDate),
  );
  await bodyWeightChanged();
}

export async function deleteBodyWeight(date: string): Promise<void> {
  await api.deleteBodyWeight(date);
  queryClient.setQueryData<BodyWeightEntry[]>(keys.bodyWeights, (old) => (old ?? []).filter((w) => w.date !== date));
  await bodyWeightChanged();
}

// ---- search ----

/**
 * Debounced gym search. Previous results stay up while the next ones load, so the list does not
 * blank on every keystroke, and a query you have already run comes back instantly.
 */
export function useGymSearchQuery(q: string, enabled = true) {
  const needle = q.trim();
  const settled = useDebounced(needle, needle ? 250 : 0);
  const query = useQuery({
    queryKey: keys.gyms.search(settled),
    queryFn: () => api.searchGyms(settled),
    enabled,
    staleTime: SEARCH_STALE_MS,
    placeholderData: keepPreviousData,
  });
  return {
    found: query.data ?? [],
    // Typing (waiting out the debounce) and fetching both count as loading.
    loading: enabled && (needle !== settled || query.isFetching),
    error: query.isError && !query.data ? message(query.error) : null,
    retry: () => void query.refetch(),
  };
}

export function useGym(id: string) {
  const query = useQuery({ queryKey: keys.gyms.detail(id), queryFn: () => api.getGym(id) });
  return { detail: query.data ?? null, error: query.isError ? message(query.error) : null, reload: () => void query.refetch() };
}

export function useGymHistory(id: string) {
  const query = useQuery({ queryKey: keys.gyms.history(id), queryFn: () => api.gymHistory(id) });
  return { edits: query.data ?? [], loading: query.isPending };
}

/** Chains already in the directory, for the chain field's suggestions. */
export function useGymChains(enabled = true) {
  const query = useQuery({ queryKey: keys.gyms.chains(), queryFn: () => api.gymChains(), enabled, staleTime: SEARCH_STALE_MS });
  return query.data ?? [];
}

// ---- social ----

/** People search, debounced; nothing is asked until there are three characters. */
export function usePeopleSearch(q: string) {
  const needle = q.trim();
  const settled = useDebounced(needle, 300);
  const enabled = settled.length >= 3;
  const query = useQuery({
    queryKey: keys.people.search(settled),
    queryFn: () => api.searchPeople(settled),
    enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
  return {
    people: enabled ? (query.data ?? []) : [],
    searching: needle.length >= 3 && (needle !== settled || query.isFetching),
    tooShort: needle.length > 0 && needle.length < 3,
    error: query.isError ? message(query.error) : null,
  };
}

export function usePerson(id: string) {
  const query = useQuery({ queryKey: keys.people.profile(id), queryFn: () => api.getPerson(id) });
  return { person: query.data ?? null, error: query.isError ? message(query.error) : null, reload: () => void query.refetch() };
}

export function usePersonWorkouts(id: string, enabled: boolean) {
  const query = useQuery({ queryKey: keys.people.workouts(id), queryFn: () => api.personWorkouts(id), enabled });
  return { workouts: query.data ?? [], loading: enabled && query.isPending };
}

/** A friend's activity calendar, for the heatmap on their profile. */
export function usePersonConsistency(id: string, enabled: boolean) {
  const query = useQuery({ queryKey: keys.people.consistency(id), queryFn: () => api.personConsistency(id), enabled });
  return { data: query.data ?? null, loading: enabled && query.isPending };
}

export function usePersonWorkout(id: string, workoutId: string) {
  const query = useQuery({ queryKey: keys.people.workout(id, workoutId), queryFn: () => api.personWorkout(id, workoutId) });
  return { data: query.data ?? null, error: query.isError ? message(query.error) : null };
}

export function useFriends() {
  const query = useQuery({ queryKey: keys.friends.list(), queryFn: () => api.friends() });
  return { friends: query.data ?? [], loading: query.isPending };
}

export function useFriendRequests() {
  const query = useQuery({ queryKey: keys.friends.requests(), queryFn: () => api.friendRequests() });
  return { incoming: query.data?.incoming ?? [], outgoing: query.data?.outgoing ?? [] };
}

export function useBlocked() {
  const query = useQuery({ queryKey: keys.friends.blocked(), queryFn: () => api.blocks() });
  return query.data ?? [];
}

export function useNotifications() {
  const query = useQuery({ queryKey: keys.notifications.list(), queryFn: () => api.notifications() });
  return { data: query.data ?? null, loading: query.isPending, error: query.isError ? message(query.error) : null };
}

/** The badge number. Checked again every minute and when the app comes back to the front. */
export function useUnreadCount(enabled = true) {
  const query = useQuery({
    queryKey: keys.notifications.unread(),
    queryFn: () => api.unreadNotifications(),
    enabled,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  return query.data?.count ?? 0;
}

/** The admin's people list: debounced search, or only the moderators and admins. */
export function useAdminUsers(q: string, filter: "all" | "staff") {
  const needle = q.trim();
  const settled = useDebounced(needle, 250);
  const query = useQuery({
    queryKey: keys.admin.users(settled, filter),
    queryFn: () => api.adminUsers(settled, filter),
    placeholderData: keepPreviousData,
  });
  return {
    users: query.data ?? [],
    loading: query.isPending || needle !== settled || query.isFetching,
    error: query.isError && !query.data ? message(query.error) : null,
  };
}

export function useReports(status: "open" | "resolved") {
  const query = useQuery({ queryKey: keys.reports.list(status), queryFn: () => api.reports(status) });
  return { reports: query.data ?? [], loading: query.isPending, error: query.isError ? message(query.error) : null };
}

export function useExerciseSearch(q: string, enabled = true) {
  const needle = q.trim();
  const settled = useDebounced(needle, needle ? 250 : 0);
  const query = useQuery({
    queryKey: keys.exercises.search(settled),
    queryFn: () => api.searchExercises(settled),
    enabled,
    staleTime: SEARCH_STALE_MS,
    placeholderData: keepPreviousData,
  });
  return {
    results: query.data ?? [],
    searching: enabled && (needle !== settled || query.isFetching),
    error: query.isError ? message(query.error) : null,
  };
}

export function useTags(enabled = true) {
  const query = useQuery({ queryKey: keys.tags, queryFn: () => api.tags(), enabled, staleTime: REFERENCE_STALE_MS });
  return { tags: query.data ?? null, failed: query.isError && !query.data };
}
