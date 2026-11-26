/**
 * Every query key. They are hierarchical on purpose: invalidating ["workouts"] reaches the list and
 * every detail page under it, ["stats"] reaches every chart, and so on.
 */
export const keys = {
  workouts: {
    all: ["workouts"] as const,
    list: () => ["workouts", "list"] as const,
    detail: (id: string) => ["workouts", "detail", id] as const,
  },
  stats: {
    all: ["stats"] as const,
    consistency: () => ["stats", "consistency"] as const,
    exercises: () => ["stats", "exercises"] as const,
    progress: (exerciseId: string, variant: string | null) => ["stats", "progress", exerciseId, variant] as const,
  },
  bodyWeights: ["bodyWeights"] as const,
  gyms: {
    all: ["gyms"] as const,
    search: (q: string) => ["gyms", "search", q] as const,
    detail: (id: string) => ["gyms", "detail", id] as const,
    history: (id: string) => ["gyms", "history", id] as const,
    chains: () => ["gyms", "chains"] as const,
  },
  people: {
    all: ["people"] as const,
    search: (q: string) => ["people", "search", q] as const,
    profile: (id: string) => ["people", "profile", id] as const,
    workouts: (id: string) => ["people", "workouts", id] as const,
    workout: (id: string, workoutId: string) => ["people", "workout", id, workoutId] as const,
  },
  friends: {
    all: ["friends"] as const,
    list: () => ["friends", "list"] as const,
    requests: () => ["friends", "requests"] as const,
    blocked: () => ["friends", "blocked"] as const,
  },
  notifications: {
    all: ["notifications"] as const,
    list: () => ["notifications", "list"] as const,
    unread: () => ["notifications", "unread"] as const,
  },
  admin: {
    all: ["admin"] as const,
    users: (q: string, filter: string) => ["admin", "users", q, filter] as const,
  },
  reports: {
    all: ["reports"] as const,
    list: (status: string) => ["reports", status] as const,
  },
  exercises: {
    all: ["exercises"] as const,
    search: (q: string) => ["exercises", "search", q] as const,
  },
  tags: ["tags"] as const,
  lastSession: {
    all: ["lastSession"] as const,
    one: (exerciseId: string, variantKey: string) => ["lastSession", exerciseId, variantKey] as const,
  },
} as const;
