import { Dialog } from "@base-ui/react/dialog";
import type { ReactNode } from "react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  /** Optional element on the left of the title (e.g. a back button). */
  leading?: ReactNode;
}

/** Bottom sheet on phones, centered card on wide screens. Focus trap/restore come from Base UI. */
export function Sheet({ open, onOpenChange, title, children, leading }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="backdrop" />
        <Dialog.Popup className="sheet">
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
}

export function Confirm({ open, onOpenChange, title, description, confirmLabel, onConfirm, busy }: ConfirmProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="backdrop" />
        <Dialog.Popup className="sheet confirm">
          <Dialog.Title className="sheet-title">{title}</Dialog.Title>
          <Dialog.Description className="dim">{description}</Dialog.Description>
          <div className="row-actions">
            <Dialog.Close className="btn">Cancel</Dialog.Close>
            <button className="btn danger" onClick={onConfirm} disabled={busy}>
              {confirmLabel}
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
