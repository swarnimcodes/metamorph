import type { AppNotification } from "../api/types";
import { paths } from "../router";

/** What a notification says and where tapping it goes. A like is on your own workout, so it opens your own history. */
export function describeNotification(n: Pick<AppNotification, "kind" | "actor" | "workout_id">): { text: string; to: string } {
  const who = n.actor.display_name;
  switch (n.kind) {
    case "friend_request":
      return { text: `${who} sent you a friend request`, to: paths.person(n.actor.id) };
    case "friend_accepted":
      return { text: `${who} accepted your friend request`, to: paths.person(n.actor.id) };
    default:
      return { text: `${who} liked your workout`, to: n.workout_id ? paths.detail(n.workout_id) : paths.home };
  }
}
