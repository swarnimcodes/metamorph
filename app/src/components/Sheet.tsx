import { Dialog } from "@base-ui/react/dialog";
import type { ReactNode } from "react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  /** Optional element on the left of the title (e.g. a back button). */
  leading?: ReactNode;
  /**
   * Fixed height instead of fitting the content. For sheets whose content changes as you type (search
   * results), so the top edge stays put and only the list scrolls.
   */
  tall?: boolean;
}

/** Bottom sheet on phones, centered card on wide screens. Focus trap/restore come from Base UI. */
export function Sheet({ open, onOpenChange, title, children, leading, tall }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="backdrop" />
        <Dialog.Popup className={tall ? "sheet tall" : "sheet"}>
          <header className="sheet-head">
            {leading}
            <Dialog.Title className="sheet-title">{title}</Dialog.Title>
            <Dialog.Close className="icon-btn" aria-label="Close">
              <span aria-hidden>✕</span>
            </Dialog.Close>
          </header>
          <div className="sheet-body">{children}</div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface ConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  busy?: boolean;
  /** Red for something destructive (the default); a normal button for a change that is not. */
  tone?: "danger" | "normal";
}

export function Confirm({ open, onOpenChange, title, description, confirmLabel, onConfirm, busy, tone = "danger" }: ConfirmProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="backdrop" />
        <Dialog.Popup className="sheet confirm">
          <Dialog.Title className="sheet-title">{title}</Dialog.Title>
          <Dialog.Description className="dim">{description}</Dialog.Description>
          <div className="row-actions">
            <Dialog.Close className="btn">Cancel</Dialog.Close>
            <button className={tone === "danger" ? "btn danger" : "btn primary"} onClick={onConfirm} disabled={busy}>
              {confirmLabel}
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
