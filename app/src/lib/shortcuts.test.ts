import { describe, expect, it } from "vitest";
import { PAGE_KEYS, TAB_KEYS, isTyping, shortcutFor, type KeyInfo } from "./shortcuts";

const press = (key: string, over: Partial<KeyInfo> = {}): KeyInfo => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  target: null,
  dialogOpen: false,
  ...over,
});

const el = (tag: string, props: Record<string, unknown> = {}) => ({ tagName: tag.toUpperCase(), ...props }) as unknown as Element;

describe("shortcutFor", () => {
  it("opens the four tabs with 1-4, in navigation order", () => {
    expect(TAB_KEYS).toEqual(["train", "progress", "social", "you"]);
    TAB_KEYS.forEach((tab, i) => expect(shortcutFor(press(String(i + 1)))).toEqual({ type: "go", tab }));
  });

  it("ignores other digits and multi-character keys", () => {
    for (const key of ["0", "5", "9", "10", "F1", "Enter", "ArrowUp"]) expect(shortcutFor(press(key))).toBeNull();
  });

  it("activates the page's own action for n and /, whatever the case", () => {
    expect(PAGE_KEYS).toEqual(["n", "/"]);
    expect(shortcutFor(press("n"))).toEqual({ type: "activate", key: "n" });
    expect(shortcutFor(press("N"))).toEqual({ type: "activate", key: "n" });
    expect(shortcutFor(press("/"))).toEqual({ type: "activate", key: "/" });
  });

  it("leaves unknown letters alone", () => {
    for (const key of ["a", "x", "?", " "]) expect(shortcutFor(press(key))).toBeNull();
  });

  it("never fires with a modifier held, so the browser's shortcuts keep working", () => {
    for (const over of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      expect(shortcutFor(press("1", over))).toBeNull();
      expect(shortcutFor(press("n", over))).toBeNull();
    }
  });

  it("never fires while a sheet is open", () => {
    expect(shortcutFor(press("2", { dialogOpen: true }))).toBeNull();
  });

  it("never fires while someone is typing", () => {
    for (const target of [el("input"), el("textarea"), el("select"), el("div", { isContentEditable: true })]) {
      expect(shortcutFor(press("1", { target }))).toBeNull();
      expect(shortcutFor(press("/", { target }))).toBeNull();
    }
    // Focus on a button or a link does not count as typing.
    expect(shortcutFor(press("1", { target: el("button") }))).toEqual({ type: "go", tab: "train" });
  });
});

describe("isTyping", () => {
  it("is false with nothing focused", () => expect(isTyping(null)).toBe(false));
});
