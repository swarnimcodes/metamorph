// Keyboard shortcuts for a keyboard-and-mouse screen. They never fire while someone is typing, while a sheet is open,
// or with a modifier held (so the browser's own shortcuts keep working).

export type ShortcutAction =
  | { type: "go"; tab: "train" | "progress" | "social" | "you" }
  | { type: "activate"; key: string };

/** What the `1`-`4` keys open, in the order of the navigation. */
export const TAB_KEYS = ["train", "progress", "social", "you"] as const;

/** Keys that act on whatever on the page opted in with `data-shortcut="<key>"`: `n` starts a workout, `/` searches. */
export const PAGE_KEYS = ["n", "/"] as const;

/** Whether a key press belongs to a text field, where letters and digits are for typing. */
export function isTyping(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return (el as HTMLElement).isContentEditable === true;
}

export interface KeyInfo {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  /** The element that has focus. */
  target: Element | null;
  /** Whether a dialog (a sheet) is open. */
  dialogOpen: boolean;
}

/** The action a key press asks for, or null if it is not ours to handle. */
export function shortcutFor(e: KeyInfo): ShortcutAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey || e.dialogOpen || isTyping(e.target)) return null;
  const digit = Number(e.key);
  if (Number.isInteger(digit) && digit >= 1 && digit <= TAB_KEYS.length && e.key.length === 1) {
    return { type: "go", tab: TAB_KEYS[digit - 1] };
  }
  const key = e.key.toLowerCase();
  if ((PAGE_KEYS as readonly string[]).includes(key)) return { type: "activate", key };
  return null;
}
