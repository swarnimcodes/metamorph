import { useState } from "react";
import { api } from "../api/client";
import { haptic } from "./haptics";
import { socialChanged } from "./invalidate";
import { toastError } from "./toast";
import { errMsg } from "../stores/auth";

/**
 * The things you can do to another person. Each one re-checks everything that depends on people afterwards,
 * whether or not it worked: after a failure that is what repairs a stale label.
 */
export function usePersonActions() {
  const [busy, setBusy] = useState(false);

  async function run(what: string, fn: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    try {
      await fn();
      return true;
    } catch (e) {
      toastError(`Couldn't ${what}: ${errMsg(e)}`);
      return false;
    } finally {
      await socialChanged();
      setBusy(false);
    }
  }

  return {
    busy,
    send: (id: string) => run("send the request", () => api.sendFriendRequest(id)).then((ok) => (ok && haptic("tap"), ok)),
    accept: (id: string) => run("accept the request", () => api.acceptFriendRequest(id)).then((ok) => (ok && haptic("success"), ok)),
    /** Cancel or decline a request: with `pendingOnly` an accepted friendship is never ended by a stale screen. */
    remove: (id: string, pendingOnly = false) => run("update the friendship", () => api.removeFriendship(id, pendingOnly)),
    block: (id: string) => run("block", () => api.blockPerson(id)),
    unblock: (id: string) => run("unblock", () => api.unblockPerson(id)),
  };
}
