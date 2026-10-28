import { clearSession, loadSession, saveSession } from "./tokenStorage";
import type {
  Exercise, Gym, LastSession, LoginResponse, Me, MeUpdate, NewGym, SavedGym, SetInput, Tag, Workout,
  WorkoutExercise, WorkoutSet, WorkoutSummary,
} from "./types";

export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:3000";

export class ApiError extends Error {
  readonly status: number;
  readonly data: unknown;
  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

let onSessionExpired: () => void = () => {};
export function setSessionExpiredHandler(h: () => void): void {
  onSessionExpired = h;
}

interface Opts {
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  auth?: boolean;
  retried?: boolean;
}

function url(path: string, query?: Opts["query"]): string {
  const u = new URL(path, API_URL.endsWith("/") ? API_URL : API_URL + "/");
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== "") u.searchParams.set(k, String(v)); // encodes '+' etc.
  }
  return u.toString();
}

async function send(method: string, path: string, opts: Opts): Promise<Response> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.auth !== false) {
    const s = loadSession();
    if (s) headers.Authorization = `Bearer ${s.accessToken}`;
  }
  try {
    return await fetch(url(path, opts.query), {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new ApiError(0, "Can't reach the server");
  }
}

async function toError(res: Response): Promise<ApiError> {
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    /* non-JSON body */
  }
  const msg = (data as { error?: unknown } | undefined)?.error;
  return new ApiError(res.status, typeof msg === "string" ? msg : `Request failed (${res.status})`, data);
}

let refreshing: Promise<boolean | null> | null = null;

/**
 * Single-flight: concurrent 401s share one refresh. Resolves true when new
 * tokens are stored, false when the server rejected the refresh (or there is
 * no refresh token), null when it could not be attempted (offline / 5xx).
 */
function refreshSession(): Promise<boolean | null> {
  refreshing ??= (async (): Promise<boolean | null> => {
    const s = loadSession();
    if (!s?.refreshToken) return false;
    try {
      const res = await send("POST", "/auth/refresh", { body: { refresh_token: s.refreshToken }, auth: false });
      if (res.status >= 500) return null;
      if (!res.ok) return false;
      storeLogin((await res.json()) as LoginResponse);
      return true;
    } catch {
      return null;
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export function storeLogin(r: LoginResponse): void {
  saveSession({ accessToken: r.access_token, refreshToken: r.refresh_token, username: r.username });
}

async function request<T>(method: string, path: string, opts: Opts = {}): Promise<T> {
  const res = await send(method, path, opts);
  if (res.status === 401 && opts.auth !== false && !opts.retried) {
    const ok = await refreshSession();
    if (ok) return request<T>(method, path, { ...opts, retried: true });
    if (ok === false) {
      clearSession();
      onSessionExpired();
    }
    // ok === null: refresh could not be attempted (offline); keep the session.
    throw await toError(res);
  }
  if (!res.ok) {
    if (res.status === 401 && opts.auth !== false) {
      clearSession();
      onSessionExpired();
    }
    throw await toError(res);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  devLogin: (username: string) =>
    request<LoginResponse>("POST", "/auth/dev-login", { body: { username }, auth: false }),
  me: () => request<Me>("GET", "/me"),
  updateMe: (body: MeUpdate) => request<Me>("PATCH", "/me", { body }),

  searchExercises: (q: string, limit = 25) => request<Exercise[]>("GET", "/exercises", { query: { q, limit } }),
  tags: () => request<Tag[]>("GET", "/tags"),

  listWorkouts: (before?: string, limit = 20) =>
    request<WorkoutSummary[]>("GET", "/workouts", { query: { before, limit } }),
  createWorkout: (body: { title?: string; gym_id?: string }) => request<Workout>("POST", "/workouts", { body }),
  getWorkout: (id: string) => request<Workout>("GET", `/workouts/${id}`),
  updateWorkout: (id: string, body: { title?: string; gym_id?: string; notes?: string }) =>
    request<Workout>("PATCH", `/workouts/${id}`, { body }),
  finishWorkout: (id: string) => request<Workout>("POST", `/workouts/${id}/finish`, { body: {} }),
  deleteWorkout: (id: string) => request<void>("DELETE", `/workouts/${id}`),
  addExercise: (workoutId: string, exerciseId: string, tagIds: string[]) =>
    request<WorkoutExercise>("POST", `/workouts/${workoutId}/exercises`, {
      body: { exercise_id: exerciseId, tag_ids: tagIds },
    }),
  removeExercise: (weId: string) => request<void>("DELETE", `/workout-exercises/${weId}`),
  addSet: (weId: string, body: SetInput) => request<WorkoutSet>("POST", `/workout-exercises/${weId}/sets`, { body }),
  updateSet: (id: string, body: SetInput) => request<WorkoutSet>("PATCH", `/sets/${id}`, { body }),
  deleteSet: (id: string) => request<void>("DELETE", `/sets/${id}`),

  lastSession: (exerciseId: string, variantKey: string) =>
    request<LastSession>("GET", `/exercises/${exerciseId}/last`, { query: { variant_key: variantKey } }),
  searchGyms: (q: string, limit = 20) => request<Gym[]>("GET", "/gyms", { query: { q, limit } }),
  createGym: (body: NewGym) => request<Gym>("POST", "/gyms", { body }),
  myGyms: () => request<SavedGym[]>("GET", "/me/gyms"),
  setDefaultGym: (id: string) => request<void>("PUT", `/me/gyms/${id}/default`),
};
