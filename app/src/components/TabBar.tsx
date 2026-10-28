import type { ReactNode } from "react";
import { paths } from "../router";

export type Tab = "workouts" | "stats";

const icon = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

const TABS: { id: Tab; label: string; href: string; glyph: ReactNode }[] = [
  // The barbell from the logo.
  { id: "workouts", label: "Workouts", href: `#${paths.home}`, glyph: icon(<><path d="M3 12h18" /><path d="M7.5 6.5v11M16.5 6.5v11" /><path d="M4.5 9v6M19.5 9v6" /></>) },
  { id: "stats", label: "Stats", href: `#${paths.stats}`, glyph: icon(<><path d="M5 20v-8" /><path d="M12 20V5" /><path d="M19 20v-5" /></>) },
];

/** Icon-only main navigation, pinned to the bottom. `current` is null on screens that belong to neither tab (Settings). */
export function TabBar({ current }: { current: Tab | null }) {
  return (
    <nav className="tabbar" aria-label="Main">
      <div className="tabbar-inner">
        {TABS.map((t) => (
          <a
            key={t.id}
            href={t.href}
            className="tab"
            aria-label={t.label}
            title={t.label}
            aria-current={t.id === current ? "page" : undefined}
          >
            {t.glyph}
          </a>
        ))}
      </div>
    </nav>
  );
}
