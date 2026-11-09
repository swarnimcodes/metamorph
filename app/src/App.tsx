import { useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { TabBar, type Tab } from "./components/TabBar";
import { Toasts } from "./components/Toasts";
import { shortcutFor } from "./lib/shortcuts";
import { navigate, paths, useRoute } from "./router";
import { ActiveWorkout } from "./screens/ActiveWorkout";
import { Home } from "./screens/Home";
import { Login } from "./screens/Login";
import { ExerciseProgress } from "./screens/ExerciseProgress";
import { Social } from "./screens/Social";
import { Stats } from "./screens/Stats";
import { WorkoutDetail } from "./screens/WorkoutDetail";
import { You } from "./screens/You";
import { useAuth } from "./stores/auth";

export default function App() {
  const { status, error, init } = useAuth();
  const route = useRoute();

  useEffect(() => {
    void init();
  }, [init]);

  // The device's zone changes when someone travels; check whenever the app comes back to the front.
  useEffect(() => {
    const check = () => {
      if (document.visibilityState === "visible") void useAuth.getState().syncTimeZone();
    };
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, []);

  // Keyboard shortcuts (1-4 for the tabs, n and / for the page's own action), only when signed in.
  useEffect(() => {
    if (status !== "signed-in") return;
    const onKey = (e: KeyboardEvent) => {
      const action = shortcutFor({
        key: e.key,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        target: document.activeElement,
        dialogOpen: document.querySelector('[role="dialog"]') !== null,
      });
      if (!action) return;
      if (action.type === "go") {
        const to = { train: paths.home, progress: paths.stats, social: paths.social, you: paths.you }[action.tab];
        e.preventDefault();
        navigate(to);
        return;
      }
      const target = document.querySelector<HTMLElement>(`[data-shortcut="${action.key}"]`);
      if (!target) return;
      e.preventDefault();
      if (target instanceof HTMLInputElement) target.focus();
      else target.click();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [status]);

  let content;
  if (status === "loading") content = <main className="screen center"><p className="dim">Loading…</p></main>;
  else if (status === "unreachable")
    content = (
      <main className="screen center">
        <h1 className="brand">Metamorph</h1>
        <p className="error" role="alert">{error ?? "Can't reach the server"}</p>
        <button className="btn primary" onClick={() => void init()}>Try again</button>
        <button className="btn quiet" onClick={() => useAuth.getState().logout()}>Log out</button>
      </main>
    );
  else if (status === "signed-out") content = <Login />;
  else if (route.name === "workout") content = <ActiveWorkout id={route.id} />;
  else if (route.name === "detail") content = <WorkoutDetail id={route.id} />;
  else if (route.name === "stats") content = <Stats />;
  else if (route.name === "exercise") content = <ExerciseProgress id={route.id} variant={route.variant} from={route.from} />;
  else if (route.name === "you") content = <You />;
  else if (route.name === "social") content = <Social />;
  else content = <Home />;

  // Main navigation stays pinned on every signed-in screen except the active workout,
  // which has its own sticky Finish bar and should not be left by a stray tap.
  const showTabs = status === "signed-in" && route.name !== "workout";
  const tab: Tab | null =
    route.name === "home" || route.name === "detail"
      ? "train"
      : route.name === "stats" || route.name === "exercise"
        ? "progress"
        : route.name === "social"
          ? "social"
          : route.name === "you"
            ? "you"
            : null;

  return (
    <>
      {/* On wide screens the sidebar sits beside the content; below 900px CSS hides it and the tab bar shows. */}
      <div className="shell">
        {showTabs && <Sidebar current={tab} />}
        <div className="shell-main">{content}</div>
      </div>
      {showTabs && <TabBar current={tab} />}
      <Toasts />
    </>
  );
}
