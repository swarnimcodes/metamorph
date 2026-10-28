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
    </li>
  );
}
