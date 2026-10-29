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
