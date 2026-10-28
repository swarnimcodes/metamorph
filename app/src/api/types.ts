// Hand-written mirrors of the JSON served by crates/api. snake_case, RFC 3339
// timestamps, decimals as JSON numbers, ids as UUID strings.

export type UnitSystem = "metric" | "imperial";
export type ExerciseKind = "weight_reps" | "bodyweight_reps" | "duration" | "distance";
export type SetType = "working" | "warmup" | "drop" | "failure";
export type TagCategory = "equipment" | "grip" | "angle" | "stance" | "other";

export interface Me {
  id: string;
  username: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
  unit_system: UnitSystem;
  timezone: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user_id: string;
  username: string;
  refresh_token: string;
  refresh_expires_in: number;
}

export interface Exercise {
  id: string;
  slug: string | null;
  name: string;
  kind: ExerciseKind;
  status: "official" | "user" | string;
}

export interface Tag {
  id: string;
  slug: string;
  name: string;
  category: TagCategory;
}

export interface WorkoutSet {
  id: string;
  position: number;
  set_type: SetType;
  weight_kg: number | null;
  reps: number | null;
  duration_s: number | null;
  distance_m: number | null;
  rpe: number | null;
  note: string | null;
  completed_at: string | null;
}

export interface WorkoutGym {
  id: string;
  name: string;
  city: string | null;
}

export interface WorkoutExercise {
  id: string;
  exercise_id: string;
  exercise_name: string;
  kind: ExerciseKind;
  position: number;
  variant_key: string;
  superset_group: number | null;
  notes: string | null;
  tags: Tag[];
  sets: WorkoutSet[];
}

export interface Workout {
  id: string;
  title: string | null;
  gym_id: string | null;
  gym: WorkoutGym | null;
  started_at: string;
  ended_at: string | null;
  notes: string | null;
  exercises: WorkoutExercise[];
}

export interface WorkoutSummary {
  id: string;
  title: string | null;
  gym_id: string | null;
  gym: WorkoutGym | null;
  started_at: string;
  ended_at: string | null;
  exercise_count: number;
  set_count: number;
}

export type SetInput = Partial<
  Pick<WorkoutSet, "set_type" | "weight_kg" | "reps" | "duration_s" | "distance_m" | "rpe" | "note">
>;

export interface MeUpdate {
  display_name?: string;
  unit_system?: UnitSystem;
  timezone?: string;
}

export interface LastSession {
  workout_id: string;
  started_at: string;
  sets: WorkoutSet[];
}

export interface Gym {
  id: string;
  name: string;
  chain: string | null;
  address: string | null;
  city: string | null;
  verified: boolean;
}

export interface SavedGym extends Gym {
  is_default: boolean;
}

export interface NewGym {
  name: string;
  chain?: string;
  address?: string;
  city?: string;
  force?: boolean;
}
