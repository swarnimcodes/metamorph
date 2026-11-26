import { haptic } from "./haptics";
import { Toast } from "@base-ui/react/toast";

/** Shared manager so stores (outside React) can raise toasts. */
export const toastManager = Toast.createToastManager();

export function toastError(message: string): void {
  haptic("error");
  toastManager.add({ title: message, type: "error", timeout: 4500 });
}

export function toastInfo(message: string): void {
  haptic("success");
  toastManager.add({ title: message, type: "success", timeout: 3000 });
}
