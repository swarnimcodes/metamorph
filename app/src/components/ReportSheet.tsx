import { useState, type FormEvent } from "react";
import { api } from "../api/client";
import { toastError, toastInfo } from "../lib/toast";
import { errMsg } from "../stores/auth";
import { Sheet } from "./Sheet";

/** Tell the moderators about a person, or about one of their workouts. */
export function ReportSheet({
  open, onOpenChange, userId, workoutId, title,
}: { open: boolean; onOpenChange: (o: boolean) => void; userId: string; workoutId?: string; title: string }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return;
    setBusy(true);
    try {
      await api.report({ user_id: userId, ...(workoutId && { workout_id: workoutId }), reason: reason.trim() });
      toastInfo("Thanks, a moderator will take a look");
      setReason("");
      onOpenChange(false);
    } catch (err) {
      toastError(`Couldn't send the report: ${errMsg(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title}>
      <form className="stack" onSubmit={send}>
        <label className="field">
          <span>What's wrong?</span>
          <textarea
            value={reason}
            maxLength={500}
            rows={4}
            placeholder="A short description helps the moderator"
            onChange={(e) => setReason(e.target.value)}
            autoFocus
          />
        </label>
        <p className="dim small">Only moderators see this. The person isn't told who reported them.</p>
        <button className="btn primary big" disabled={busy || !reason.trim()}>{busy ? "Sending…" : "Send report"}</button>
      </form>
    </Sheet>
  );
}
