import { useEffect } from "react";
import { TabBar, type Tab } from "./components/TabBar";
import { Toasts } from "./components/Toasts";
import { useRoute } from "./router";
import { ActiveWorkout } from "./screens/ActiveWorkout";
import { Home } from "./screens/Home";
import { Login } from "./screens/Login";
import { ExerciseProgress } from "./screens/ExerciseProgress";
import { Social } from "./screens/Social";
import { Stats } from "./screens/Stats";
import { WorkoutDetail } from "./screens/WorkoutDetail";
import { You } from "./screens/You";
import { useAuth } from "./stores/auth";
import { useHistory } from "./stores/history";
import { useStats } from "./stores/stats";

export default function App() {
  const { status, error, init } = useAuth();
  const route = useRoute();

  useEffect(() => {
    void init();
  }, [init]);

  // Drop cached history when signed out so another user never sees it.
  useEffect(() => {
    if (status === "signed-out") {
      useHistory.getState().reset();
      useStats.getState().reset();
    }
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
      {content}
      {showTabs && <TabBar current={tab} />}
      <Toasts />
    </>
  );
}
