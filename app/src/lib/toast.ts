import { Toast } from "@base-ui/react/toast";

/** Shared manager so stores (outside React) can raise toasts. */
export const toastManager = Toast.createToastManager();

export function toastError(message: string): void {
  toastManager.add({ title: message, type: "error", timeout: 4500 });
}
