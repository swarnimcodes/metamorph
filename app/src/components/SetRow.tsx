import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { useState } from "react";
import type { ExerciseKind, SetInput, SetType, WorkoutSet } from "../api/types";
import { displayToKg, kgToDisplay, weightLabel } from "../lib/units";
import { useAuth } from "../stores/auth";
import { useWorkout } from "../stores/workout";
import { NumField } from "./NumField";
import { Sheet } from "./Sheet";

const TYPES: { value: SetType; label: string; badge: string }[] = [
  { value: "working", label: "Working", badge: "" },
  { value: "warmup", label: "Warm-up", badge: "W" },
  { value: "drop", label: "Drop", badge: "D" },
  { value: "failure", label: "Failure", badge: "F" },
];

/** Reps in reserve choices; 5 stands for "five or more". */
const RIR_OPTIONS = [0, 1, 2, 3, 4, 5];
const rirText = (n: number) => (n >= 5 ? "5+" : String(n));

interface Props {
  weId: string;
  set: WorkoutSet;
  index: number;
  kind: ExerciseKind;
}

export function SetRow({ weId, set, index, kind }: Props) {
  const unit = useAuth((s) => s.user?.unit_system ?? "metric");
  const updateSet = useWorkout((s) => s.updateSet);
  const deleteSet = useWorkout((s) => s.deleteSet);
  const [typeOpen, setTypeOpen] = useState(false);
  const [rirOpen, setRirOpen] = useState(false);
  const tracksRir = kind === "weight_reps" || kind === "bodyweight_reps";
  const n = index + 1;
  const type = TYPES.find((t) => t.value === set.set_type) ?? TYPES[0];
  const save = (patch: SetInput) => void updateSet(weId, set.id, patch);

  const w = (
    <NumField
      key="w"
      label={`Set ${n} ${kind === "bodyweight_reps" ? "added weight" : "weight"} (${weightLabel(unit)})`}
      suffix={weightLabel(unit)}
      value={kgToDisplay(set.weight_kg, unit)}
      onCommit={(v) => save({ weight_kg: displayToKg(v, unit) })}
    />
  );
  const reps = (
    <NumField key="r" label={`Set ${n} reps`} suffix="reps" integer value={set.reps} onCommit={(v) => save({ reps: v })} />
  );
  const dur = (
    <NumField key="d" label={`Set ${n} duration (seconds)`} suffix="s" integer value={set.duration_s} onCommit={(v) => save({ duration_s: v })} />
  );
  const dist = (
    <NumField key="m" label={`Set ${n} distance (metres)`} suffix="m" value={set.distance_m === null ? null : Number(set.distance_m)} onCommit={(v) => save({ distance_m: v })} />
  );
  const fields = {
    weight_reps: [w, reps],
    bodyweight_reps: [reps, w],
    duration: [dur],
    distance: [dist, dur],
  }[kind];

  return (
    <li className="set-row" data-type={set.set_type}>
      <button
        className="set-badge"
        onClick={() => setTypeOpen(true)}
        aria-label={`Set ${n}, ${type.label.toLowerCase()}. Change set type`}
      >
        {type.badge || n}
        {type.badge && <small>{n}</small>}
      </button>
      <div className="set-fields">{fields}</div>
      {tracksRir && (
        <button
          className="rir-btn"
          data-set={set.rir !== null}
          onClick={() => setRirOpen(true)}
          aria-label={set.rir === null ? `Set ${n} reps in reserve, not set` : `Set ${n} reps in reserve, ${rirText(set.rir)}`}
        >
          <small aria-hidden>RIR</small>
          <span aria-hidden>{set.rir === null ? "–" : rirText(set.rir)}</span>
        </button>
      )}
      <button className="icon-btn" aria-label={`Delete set ${n}`} onClick={() => void deleteSet(weId, set.id)}>
        <span aria-hidden>✕</span>
      </button>

      <Sheet open={typeOpen} onOpenChange={setTypeOpen} title={`Set ${n} type`}>
        <ToggleGroup
          className="type-group"
          value={[set.set_type]}
          onValueChange={(v) => {
            const next = v[0];
            if (next && next !== set.set_type) save({ set_type: next });
            setTypeOpen(false);
          }}
          aria-label="Set type"
        >
          {TYPES.map((t) => (
            <Toggle key={t.value} value={t.value} className="type-opt">
              {t.label}
            </Toggle>
          ))}
        </ToggleGroup>
      </Sheet>

      <Sheet open={rirOpen} onOpenChange={setRirOpen} title={`Set ${n} reps in reserve`}>
        <p className="dim small rir-hint">How many more reps could you have done? 0 means to failure. Tap the chosen one again to clear it.</p>
        <ToggleGroup
          className="rir-group"
          value={set.rir === null ? [] : [String(set.rir)]}
          onValueChange={(v) => {
            save({ rir: v[0] === undefined ? null : Number(v[0]) });
            setRirOpen(false);
          }}
          aria-label="Reps in reserve"
        >
          {RIR_OPTIONS.map((r) => (
            <Toggle key={r} value={String(r)} className="type-opt" aria-label={r === 5 ? "5 or more" : String(r)}>
              {rirText(r)}
            </Toggle>
          ))}
        </ToggleGroup>
      </Sheet>
    </li>
  );
}
