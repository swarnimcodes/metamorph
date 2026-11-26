import { useState } from "react";
import { api } from "../api/client";
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
    send: (id: string) => run("send the request", () => api.sendFriendRequest(id)),
    accept: (id: string) => run("accept the request", () => api.acceptFriendRequest(id)),
    remove: (id: string) => run("update the friendship", () => api.removeFriendship(id)),
    block: (id: string) => run("block", () => api.blockPerson(id)),
    unblock: (id: string) => run("unblock", () => api.unblockPerson(id)),
  };
}
