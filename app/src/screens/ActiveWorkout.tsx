import { useEffect, useState } from "react";
import { ExercisePicker } from "../components/ExercisePicker";
import { GymPicker } from "../components/GymPicker";
import { directionsUrl } from "../lib/gyms";
import { SetRow } from "../components/SetRow";
import { Confirm } from "../components/Sheet";
import { formatElapsed, formatSet } from "../lib/format";
import { useNow } from "../lib/useNow";
import { navigate, paths } from "../router";
import { useAuth } from "../stores/auth";
import { useHistory } from "../stores/history";
import { referenceSet, useWorkout } from "../stores/workout";
import type { WorkoutExercise } from "../api/types";

export function ActiveWorkout({ id }: { id: string }) {
  const { workout, loading, error, load, clear, rename, finish, discard } = useWorkout();
  const reloadHistory = useHistory((s) => s.reload);
  const now = useNow(1000);
  const [pickExercise, setPickExercise] = useState(false);
  const [pickGym, setPickGym] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void load(id);
    return clear;
  }, [id, load, clear]);

  if (!workout) {
    return (
      <main className="screen">
        <button className="btn quiet back" onClick={() => navigate(paths.home)}>‹ Back</button>
        {error ? (
          <p className="error" role="alert">
            {error} <button className="link" onClick={() => void load(id)}>Retry</button>
          </p>
        ) : (
          <p className="dim empty">{loading ? "Loading…" : ""}</p>
        )}
      </main>
    );
  }

  if (workout.ended_at) return <Redirect to={paths.detail(workout.id)} />;

  async function onFinish() {
    setBusy(true);
    if (await finish()) {
      void reloadHistory();
      navigate(paths.home);
    } else setBusy(false);
  }

  async function onDiscard() {
    setBusy(true);
    if (await discard()) {
      void reloadHistory();
      navigate(paths.home);
    } else {
      setBusy(false);
      setConfirmDiscard(false);
    }
  }

  return (
    <main className="screen with-bar">
      <header className="workout-head">
        <div className="head-row">
          <button className="btn quiet back" onClick={() => navigate(paths.home)}>‹ History</button>
          <span className="timer" role="timer" aria-label="Elapsed time">{formatElapsed(workout.started_at, now)}</span>
        </div>
        <TitleField key={workout.id} value={workout.title ?? ""} onCommit={(t) => void rename(t)} />
        <div className="gym-line">
          <button className="chip action" onClick={() => setPickGym(true)}>
            {workout.gym?.name ?? "+ Add gym"}
          </button>
          {workout.gym && (
            <a className="chip action" href={directionsUrl(workout.gym)} target="_blank" rel="noopener noreferrer" aria-label={`Directions to ${workout.gym.name}`}>
              Directions
            </a>
          )}
        </div>
      </header>

      <div className="stack-lg">
        {workout.exercises.map((we) => (
          <ExerciseCard key={we.id} we={we} />
        ))}
      </div>

      {workout.exercises.length === 0 && <p className="dim empty">Add your first exercise to get going.</p>}
      <button className="btn big" onClick={() => setPickExercise(true)}>Add exercise</button>
      <button className="btn quiet danger-text" onClick={() => setConfirmDiscard(true)}>Discard workout</button>

      <div className="bar">
        <button className="btn primary big" onClick={onFinish} disabled={busy}>Finish workout</button>
      </div>

      <ExercisePicker open={pickExercise} onOpenChange={setPickExercise} />
      <GymPicker open={pickGym} onOpenChange={setPickGym} />
      <Confirm
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard workout?"
        description="This deletes the workout and everything logged in it."
        confirmLabel="Discard"
        onConfirm={() => void onDiscard()}
        busy={busy}
      />
    </main>
  );
}

/** Already finished elsewhere: show the recap instead. */
function Redirect({ to }: { to: string }) {
  useEffect(() => navigate(to, { replace: true }), [to]);
  return null;
}

function TitleField({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  return (
    <input
      className="title-input"
      aria-label="Workout title"
      placeholder="Workout"
      value={draft}
      maxLength={80}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const t = draft.trim();
        if (t) onCommit(t);
        else setDraft(value);
      }}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}

function ExerciseCard({ we }: { we: WorkoutExercise }) {
  const unit = useAuth((s) => s.user?.unit_system ?? "metric");
  const kind = we.kind;
  const hint = useWorkout((s) => s.hints[`${we.exercise_id}|${we.variant_key}`]);
  const { loadHint, addSet, removeExercise } = useWorkout.getState();
  const [adding, setAdding] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    void loadHint(we);
  }, [we.exercise_id, we.variant_key]); // eslint-disable-line react-hooks/exhaustive-deps

  const ref = referenceSet(hint, we.sets.length);
  const hintText = ref ? formatSet(ref, unit) : "";

  return (
    <section className="card exercise" aria-label={we.exercise_name}>
      <header className="ex-head">
        <div>
          <h2>{we.exercise_name}</h2>
          {we.tags.length > 0 && (
            <div className="chips">
              {we.tags.map((t) => (
                <span key={t.id} className="chip static">{t.name}</span>
              ))}
            </div>
          )}
        </div>
        <button className="icon-btn" aria-label={`Remove ${we.exercise_name}`} onClick={() => (we.sets.length ? setConfirmRemove(true) : void removeExercise(we.id))}>
          <span aria-hidden>🗑</span>
        </button>
      </header>

      {we.sets.length > 0 && (
        <ol className="sets">
          {we.sets.map((s, i) => (
            <SetRow key={s.id} weId={we.id} set={s} index={i} kind={kind} />
          ))}
        </ol>
      )}

      {hintText && <p className="hint">Last time: {hintText}</p>}
      <button
        className="btn"
        disabled={adding}
        onClick={async () => {
          setAdding(true);
          await addSet(we);
          setAdding(false);
        }}
      >
        Add set
      </button>

      <Confirm
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={`Remove ${we.exercise_name}?`}
        description="Its sets will be deleted from this workout."
        confirmLabel="Remove"
        onConfirm={() => void removeExercise(we.id)}
      />
    </section>
  );
}
