import type { Person } from "../api/types";
import { usePersonActions } from "../lib/usePersonActions";
import { navigate, paths } from "../router";
import { Avatar } from "./Avatar";

/** What a row offers next to a person, by how they relate to you. */
function RowAction({ person }: { person: Person }) {
  const { busy, send, accept, unblock } = usePersonActions();
  const id = person.id;
  switch (person.relationship) {
    case "none":
      return <button className="btn small-btn" disabled={busy} onClick={() => void send(id)}>Add</button>;
    case "request_sent":
      return <span className="dim small">Requested</span>;
    case "request_received":
      return <button className="btn small-btn" disabled={busy} onClick={() => void accept(id)}>Accept</button>;
    case "blocked":
      return <button className="btn small-btn" disabled={busy} onClick={() => void unblock(id)}>Unblock</button>;
    default:
      return null;
  }
}

/** A person in a list: tap the name for their page, the button on the right for the quick action. */
export function PersonRow({ person, action = true }: { person: Person; action?: boolean }) {
  return (
    <li className="person-row">
      <button className="person-main" onClick={() => navigate(paths.person(person.id))} aria-label={`${person.display_name}, open profile`}>
        <Avatar name={person.display_name} url={person.avatar_url} />
        <span className="person-text">
          <span className="card-title">{person.display_name}</span>
          <span className="dim small">@{person.username}</span>
        </span>
      </button>
      {action && <RowAction person={person} />}
    </li>
  );
}

/** A friend request: the one you received can be accepted or declined, the one you sent can be cancelled. */
export function RequestRow({ person, direction }: { person: Person; direction: "incoming" | "outgoing" }) {
  const { busy, accept, remove } = usePersonActions();
  return (
    <li className="person-row">
      <button className="person-main" onClick={() => navigate(paths.person(person.id))} aria-label={`${person.display_name}, open profile`}>
        <Avatar name={person.display_name} url={person.avatar_url} />
        <span className="person-text">
          <span className="card-title">{person.display_name}</span>
          <span className="dim small">@{person.username}</span>
        </span>
      </button>
      {direction === "incoming" ? (
        <span className="row-buttons">
          <button className="btn small-btn" disabled={busy} onClick={() => void accept(person.id)}>Accept</button>
          <button className="btn quiet small-btn" disabled={busy} onClick={() => void remove(person.id)}>Decline</button>
        </span>
      ) : (
        <button className="btn quiet small-btn" disabled={busy} onClick={() => void remove(person.id)}>Cancel</button>
      )}
    </li>
  );
}
