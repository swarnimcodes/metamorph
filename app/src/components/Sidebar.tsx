import { LogoMark } from "./LogoMark";
import { TABS, type Tab } from "./TabBar";

/**
 * Main navigation on wide screens: labelled, with the 1-4 keys shown. Hidden by CSS below 900px, where the bottom
 * tab bar takes over; both come from the same TABS list.
 */
export function Sidebar({ current }: { current: Tab | null }) {
  return (
    <nav className="sidebar" aria-label="Main">
      <a className="sidebar-brand" href={TABS[0].href}>
        <LogoMark />
        <span>Metamorph</span>
      </a>
      <ul className="sidebar-tabs">
        {TABS.map((t, i) => (
          <li key={t.id}>
            <a
              href={t.href}
              className="sidebar-tab"
              aria-current={t.id === current ? "page" : undefined}
              title={`${t.label} (${i + 1})`}
            >
              {t.glyph}
              <span className="sidebar-label">{t.label}</span>
              <kbd aria-hidden="true">{i + 1}</kbd>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
