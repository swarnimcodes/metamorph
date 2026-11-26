import { useState } from "react";
import { api } from "../api/client";
import { ReportSheet } from "../components/ReportSheet";
import { WorkoutView } from "../components/WorkoutView";
import { haptic } from "../lib/haptics";
import { socialChanged } from "../lib/invalidate";
import { usePerson, usePersonWorkout } from "../lib/queries";
import { toastError } from "../lib/toast";
import { navigate, paths } from "../router";
import { errMsg, useAuth } from "../stores/auth";
import { SkeletonDetail } from "../components/Skeleton";

/** A friend's workout, read-only: the same view as your own, plus a like. Their notes are never sent. */
export function FriendWorkout({ id, workoutId }: { id: string; workoutId: string }) {
  const unit = useAuth((s) => s.user?.unit_system ?? "metric");
  const { data, error } = usePersonWorkout(id, workoutId);
  const { person } = usePerson(id);
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(false);

  async function toggleLike() {
    if (!data) return;
    setBusy(true);
    try {
      await (data.liked ? api.unlikeWorkout(id, workoutId) : api.likeWorkout(id, workoutId));
      if (!data.liked) haptic("tap");
    } catch (e) {
      toastError(`Couldn't update the like: ${errMsg(e)}`);
    } finally {
      await socialChanged();
      setBusy(false);
    }
  }

  const back = () => (window.history.length > 1 ? window.history.back() : navigate(paths.person(id)));

  return (
    <main className="screen medium">
      <button className="btn quiet back" onClick={back}>‹ {person?.display_name ?? "Back"}</button>
      {error && <p className="error" role="alert">{error}</p>}
      {!data && !error && <SkeletonDetail />}
      {data && (
        <>
          <WorkoutView w={data.workout} unit={unit} />
          <div className="gym-actions">
            <button className="btn like-btn" aria-pressed={data.liked} disabled={busy} onClick={() => void toggleLike()}>
              <span className="heart" aria-hidden="true">{data.liked ? "♥" : "♡"}</span> {data.liked ? "Liked" : "Like"}{data.likes > 0 && ` · ${data.likes}`}
            </button>
            <button className="btn quiet" onClick={() => setReporting(true)}>Report</button>
          </div>
          <ReportSheet open={reporting} onOpenChange={setReporting} userId={id} workoutId={workoutId} title="Report this workout" />
        </>
      )}
    </main>
  );
}
