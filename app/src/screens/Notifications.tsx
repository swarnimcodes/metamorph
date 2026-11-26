import { useEffect } from "react";
import { api } from "../api/client";
import { formatDate } from "../lib/format";
import { socialChanged } from "../lib/invalidate";
import { describeNotification } from "../lib/notifications";
import { useNotifications } from "../lib/queries";
import { navigate, paths } from "../router";

export function Notifications() {
  const { data, loading, error } = useNotifications();

  // Opening the list is reading it. Whatever was unread when it opened stays marked, until you leave.
  useEffect(() => {
    if (!data || data.unread === 0) return;
    const t = setTimeout(() => {
      void api.markNotificationsRead().then(() => socialChanged()).catch(() => undefined);
    }, 1500);
    return () => clearTimeout(t);
  }, [data]);

  return (
    <main className="screen medium">
      <button className="btn quiet back" onClick={() => navigate(paths.social)}>‹ Social</button>
      <header className="stack-sm"><h1>Notifications</h1></header>
      {error && <p className="error" role="alert">{error}</p>}
      {loading && <p className="dim empty">Loading…</p>}
      {data && data.items.length === 0 && <p className="dim empty">Nothing yet. Friend requests and likes show up here.</p>}
      {data && data.items.length > 0 && (
        <ul className="card history">
          {data.items.map((n) => {
            const { text, to } = describeNotification(n);
            return (
              <li key={n.id}>
                <button className="notice-row" data-unread={!n.read || undefined} onClick={() => navigate(to)}>
                  <span className="card-title">{text}</span>
                  <span className="dim small">{formatDate(n.at)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
