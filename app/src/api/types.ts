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

export interface GoogleSignupRequired {
  signup_required: true;
  signup_token: string;
  suggested_username: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
}

export type GoogleLoginResult = (LoginResponse & { signup_required: false }) | GoogleSignupRequired;

export type UsernameUnavailableReason = "invalid" | "reserved" | "taken";

export interface UsernameAvailability {
  available: boolean;
  reason?: UsernameUnavailableReason;
}

export interface GoogleSignupBody {
  signup_token: string;
  username: string;
  display_name: string;
}

export interface Exercise {
  id: string;
  slug: string | null;
  name: string;
  kind: ExerciseKind;
  status: "official" | "user" | string;
  /** Variation tags the search query asked for (e.g. "preacher curl" suggests `preacher`). */
  suggested_tag_ids: string[];
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
  /** Reps in reserve, 0 to 5 (5 = five or more); null when not recorded. */
  rir: number | null;
  note: string | null;
  completed_at: string | null;
}

export interface WorkoutGym {
  id: string;
  name: string;
  area: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  maps_url: string | null;
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
  /** The zone the workout happened in: show its times in it, and its day is the day there. */
  timezone: string;
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
  timezone: string;
  exercise_count: number;
  set_count: number;
}

export type SetInput = Partial<
  Pick<WorkoutSet, "set_type" | "weight_kg" | "reps" | "duration_s" | "distance_m" | "rir" | "note">
>;

export interface BodyWeightEntry {
  date: string;
  weight_kg: number;
}

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
  area: string | null;
  address: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  maps_url: string | null;
  verified: boolean;
}

export interface NewGym {
  name: string;
  chain?: string;
  area?: string;
  address?: string;
  city?: string;
  maps_url?: string;
  force?: boolean;
}

// ---- Stats ----------------------------------------------------------------
// Dates are local calendar dates ("YYYY-MM-DD") in the user's own timezone.
// Weights are kg, distances metres, durations seconds.

export interface ConsistencyDay {
  date: string;
  workouts: number;
  sets: number;
  volume_kg: number;
}

export interface Consistency {
  timezone: string;
  /** Monday of the first week shown. */
  from: string;
  /** Today in the user's timezone (inclusive). */
  to: string;
  /** Only days with at least one workout, ascending. */
  days: ConsistencyDay[];
  totals: { workouts: number; active_days: number; sets: number; volume_kg: number };
  streak: { current_weeks: number; longest_weeks: number };
}

export interface StatsExercise {
  exercise_id: string;
  name: string;
  kind: ExerciseKind;
  /** "" means untagged. */
  variant_key: string;
  variant_label: string;
  sessions: number;
  last_performed: string;
}

export interface ProgressPoint {
  date: string;
  workout_id: string;
  sets: number;
  volume_kg: number | null;
  top_weight_kg: number | null;
  best_e1rm_kg: number | null;
  top_reps: number | null;
  total_reps: number | null;
  best_duration_s: number | null;
  total_duration_s: number | null;
  best_distance_m: number | null;
  total_distance_m: number | null;
}

export interface RecordEntry {
  value: number;
  date: string;
}

export interface ProgressRecords {
  top_weight_kg: RecordEntry | null;
  best_e1rm_kg: RecordEntry | null;
  best_volume_kg: RecordEntry | null;
  top_reps: RecordEntry | null;
  best_duration_s: RecordEntry | null;
  best_distance_m: RecordEntry | null;
}

export interface ExerciseProgress {
  exercise_id: string;
  name: string;
  kind: ExerciseKind;
  /** null when aggregating all variants, else the key echoed back. */
  variant_key: string | null;
  points: ProgressPoint[];
  records: ProgressRecords;
}
