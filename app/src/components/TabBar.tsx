import type { ReactNode } from "react";
import { paths } from "../router";

export type Tab = "train" | "progress" | "social" | "you";

const icon = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

const TABS: { id: Tab; label: string; href: string; glyph: ReactNode }[] = [
  // The barbell from the logo.
  { id: "train", label: "Train", href: `#${paths.home}`, glyph: icon(<><path d="M3 12h18" /><path d="M7.5 6.5v11M16.5 6.5v11" /><path d="M4.5 9v6M19.5 9v6" /></>) },
  { id: "progress", label: "Progress", href: `#${paths.stats}`, glyph: icon(<><path d="M5 20v-8" /><path d="M12 20V5" /><path d="M19 20v-5" /></>) },
  // Two people.
  { id: "social", label: "Social", href: `#${paths.social}`, glyph: icon(<><circle cx="9" cy="8.5" r="3.25" /><path d="M2.75 19.5c.7-3.4 3.2-5.25 6.25-5.25s5.55 1.85 6.25 5.25" /><path d="M15.5 5.6a3.25 3.25 0 0 1 0 5.8" /><path d="M17.5 14.6c2 .6 3.3 2.2 3.75 4.9" /></>) },
  { id: "you", label: "You", href: `#${paths.you}`, glyph: icon(<><circle cx="12" cy="8" r="3.75" /><path d="M4.5 20.5c.8-3.9 3.9-6 7.5-6s6.7 2.1 7.5 6" /></>) },
];

/** Icon-only main navigation, pinned to the bottom. `current` is null on screens that belong to no tab. */
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
