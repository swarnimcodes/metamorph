import { useState } from "react";
import { api } from "../api/client";
import { Confirm } from "../components/Sheet";
import { WorkoutView } from "../components/WorkoutView";
import { workoutChanged } from "../lib/invalidate";
import { useWorkoutDetail } from "../lib/queries";
import { toastError } from "../lib/toast";
import { navigate, paths } from "../router";
import { errMsg, useAuth } from "../stores/auth";

export function WorkoutDetail({ id }: { id: string }) {
  const unit = useAuth((s) => s.user?.unit_system ?? "metric");
  const { workout: w, error } = useWorkoutDetail(id);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      await api.deleteWorkout(id);
      void workoutChanged();
      navigate(paths.home);
    } catch (e) {
      toastError(`Couldn't delete workout: ${errMsg(e)}`);
      setBusy(false);
      setConfirm(false);
    }
  }


  return (
    <main className="screen medium">
      <button className="btn quiet back" onClick={() => navigate(paths.home)}>‹ History</button>
      {error && <p className="error" role="alert">{error}</p>}
      {!w && !error && <p className="dim empty">Loading…</p>}
      {w && (
        <>
          <WorkoutView w={w} unit={unit} progressFrom={paths.detail(id)} />

          <button className="btn quiet danger-text" onClick={() => setConfirm(true)}>Delete workout</button>
          <Confirm
            open={confirm}
            onOpenChange={setConfirm}
            title="Delete workout?"
            description="This removes it from your history."
            confirmLabel="Delete"
            onConfirm={() => void remove()}
            busy={busy}
          />
        </>
      )}
    </main>
  );
}
