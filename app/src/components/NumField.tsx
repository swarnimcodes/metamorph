import { useEffect, useRef, useState } from "react";

interface Props {
  value: number | null;
  label: string;
  suffix: string;
  integer?: boolean;
  onCommit: (value: number) => void;
}

const show = (v: number | null) => (v === null ? "" : String(v));

/**
 * Numeric input with a local draft so server reconciliation never steals
 * focus or overwrites what is being typed. Commits on blur/Enter or after a
 * short idle. Clearing a field is not sent (the API cannot null a value): the
 * old value is restored instead.
 */
export function NumField({ value, label, suffix, integer, onCommit }: Props) {
  const [draft, setDraft] = useState(show(value));
  const focused = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!focused.current) setDraft(show(value));
  }, [value]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  function commit(text: string, final: boolean) {
    const n = Number(text.replace(",", "."));
    if (text.trim() === "" || !Number.isFinite(n) || n < 0) {
      if (final) setDraft(show(value));
      return;
    }
    const v = integer ? Math.round(n) : n;
    if (v !== value) onCommit(v);
    if (final) setDraft(String(v));
  }

  return (
    <label className="num">
      <span className="sr-only">{label}</span>
      <input
        inputMode={integer ? "numeric" : "decimal"}
        pattern={integer ? "[0-9]*" : "[0-9]*[.,]?[0-9]*"}
        enterKeyHint="done"
        value={draft}
        placeholder="0"
        onFocus={(e) => {
          focused.current = true;
          e.target.select();
        }}
        onChange={(e) => {
          setDraft(e.target.value);
          window.clearTimeout(timer.current);
          const text = e.target.value;
          timer.current = window.setTimeout(() => commit(text, false), 800);
        }}
        onBlur={(e) => {
          focused.current = false;
          window.clearTimeout(timer.current);
          commit(e.target.value, true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      <span className="num-suffix" aria-hidden>{suffix}</span>
    </label>
  );
}
