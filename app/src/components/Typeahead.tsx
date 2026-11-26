import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { filterOptions, fold, type Option } from "../lib/typeahead";

interface Props {
  label: string;
  options: readonly Option[];
  /** `pick`: the value is one of the options (a country). `free`: the value is the text, suggestions only help. */
  mode: "pick" | "free";
  /** pick: the chosen option's value ("" = none). free: the text. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
}

/**
 * A text field with a list of matches under it. Inline rather than a floating popup, so it behaves inside the
 * bottom sheet and with the on-screen keyboard open.
 */
export function Typeahead({ label, options, mode, value, onChange, placeholder, disabled, required }: Props) {
  const id = useId();
  const listId = `${id}-list`;
  const labelOf = (v: string) => (mode === "free" ? v : (options.find((o) => o.value === v)?.label ?? ""));
  const [text, setText] = useState(labelOf(value));
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const focused = useRef(false);

  // Follow the value from outside (another field changed it, the options finished loading) unless being typed in.
  useEffect(() => {
    if (!focused.current) setText(labelOf(value));
  }, [value, options]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = text === labelOf(value) && mode === "pick" ? "" : text;
  const matches = filterOptions(options, shown);

  function choose(o: Option) {
    onChange(o.value);
    setText(o.label);
    setOpen(false);
  }

  function leave() {
    focused.current = false;
    setOpen(false);
    if (mode === "free") return;
    const exact = options.find((o) => fold(o.label) === fold(text));
    if (exact) choose(exact);
    else if (!text.trim()) onChange("");
    else setText(labelOf(value));
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (matches.length ? (a + (e.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length : 0));
    } else if (e.key === "Enter" && open && matches[active]) {
      e.preventDefault();
      choose(matches[active]);
    } else if (e.key === "Escape" && open) {
      e.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <div className="field typeahead">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? `${id}-${active}` : undefined}
        autoComplete="off"
        autoCapitalize="words"
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        value={text}
        onFocus={() => {
          focused.current = true;
          setOpen(true);
        }}
        onBlur={leave}
        onKeyDown={onKeyDown}
        onChange={(e) => {
          setText(e.target.value);
          setActive(0);
          setOpen(true);
          if (mode === "free") onChange(e.target.value);
        }}
      />
      {open && matches.length > 0 && (
        <ul id={listId} role="listbox" aria-label={label} className="suggest">
          {matches.map((o, i) => (
            <li
              key={o.value}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === active}
              data-active={i === active || undefined}
              // Keep focus in the input so choosing does not blur (and revert) first.
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => choose(o)}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
