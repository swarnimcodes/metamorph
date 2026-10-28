import { useEffect } from "react";
import { Toasts } from "./components/Toasts";
import { useRoute } from "./router";
import { ActiveWorkout } from "./screens/ActiveWorkout";
import { Home } from "./screens/Home";
import { Login } from "./screens/Login";
import { Settings } from "./screens/Settings";
import { WorkoutDetail } from "./screens/WorkoutDetail";
import { useAuth } from "./stores/auth";
import { useHistory } from "./stores/history";

export default function App() {
  const { status, error, init } = useAuth();
  const route = useRoute();

  useEffect(() => {
    void init();
  }, [init]);

  // Drop cached history when signed out so another user never sees it.
  useEffect(() => {
    if (status === "signed-out") useHistory.getState().reset();
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
  else if (route.name === "settings") content = <Settings />;
  else content = <Home />;

  return (
    <>
      {content}
      <Toasts />
    </>
  );
}
