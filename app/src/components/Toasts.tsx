import { Toast } from "@base-ui/react/toast";
import { toastManager } from "../lib/toast";

function List() {
  const { toasts } = Toast.useToastManager();
  return (
    <Toast.Viewport className="toast-viewport">
      {toasts.map((t) => (
        <Toast.Root key={t.id} toast={t} className="toast">
          <Toast.Title className="toast-title" />
          <Toast.Close className="toast-close" aria-label="Dismiss">
            <span aria-hidden>✕</span>
          </Toast.Close>
        </Toast.Root>
      ))}
    </Toast.Viewport>
  );
}

export function Toasts() {
  return (
    <Toast.Provider toastManager={toastManager}>
      <List />
    </Toast.Provider>
  );
}
