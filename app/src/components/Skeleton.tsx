import type { ReactNode } from "react";

/** One grey block that shimmers. Sized by its props so the real content replaces it without the page jumping. */
export function Skeleton({ w = "100%", h = 14, round = false }: { w?: number | string; h?: number; round?: boolean }) {
  return <span className="skeleton" style={{ width: w, height: h, borderRadius: round ? "50%" : undefined }} aria-hidden="true" />;
}

/** Wraps skeletons so a screen reader hears "Loading" once instead of nothing. */
export function Loading({ children, label = "Loading" }: { children: ReactNode; label?: string }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}…</span>
      {children}
    </div>
  );
}

/** Rows of a list card: a title, a quieter line and something on the right. */
export function SkeletonRows({ count = 4, label }: { count?: number; label?: string }) {
  return (
    <Loading label={label}>
      <ul className="card history skeleton-list">
        {Array.from({ length: count }, (_, i) => (
          <li key={i}>
            <div className="row skeleton-row">
              <span className="row-main">
                <Skeleton w={i % 2 ? "48%" : "62%"} h={16} />
                <Skeleton w="34%" h={12} />
              </span>
              <Skeleton w={64} h={12} />
            </div>
          </li>
        ))}
      </ul>
    </Loading>
  );
}

/** People: an avatar circle and two lines. */
export function SkeletonPeople({ count = 3 }: { count?: number }) {
  return (
    <Loading label="Loading people">
      <ul className="card people-list skeleton-list">
        {Array.from({ length: count }, (_, i) => (
          <li key={i} className="person-row">
            <span className="person-main static">
              <Skeleton w={40} h={40} round />
              <span className="person-text">
                <Skeleton w={i % 2 ? 110 : 140} h={15} />
                <Skeleton w={80} h={12} />
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Loading>
  );
}

/** A page's heading: a big title and a quieter line under it. */
export function SkeletonHeading() {
  return (
    <div className="stack-sm" aria-hidden="true">
      <Skeleton w="55%" h={30} />
      <Skeleton w="38%" h={14} />
    </div>
  );
}

/** A card with a few lines, for exercises and detail blocks. */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="card stack-sm" aria-hidden="true">
      <Skeleton w="40%" h={18} />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} w={i % 2 ? "52%" : "70%"} h={14} />
      ))}
    </div>
  );
}

/** A whole detail screen: heading and a couple of cards. */
export function SkeletonDetail({ cards = 2 }: { cards?: number }) {
  return (
    <Loading>
      <div className="stack-lg">
        <SkeletonHeading />
        {Array.from({ length: cards }, (_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </Loading>
  );
}

/** A profile header: avatar, name, then a card. */
export function SkeletonProfile() {
  return (
    <Loading label="Loading profile">
      <div className="stack-lg">
        <div className="profile-head" aria-hidden="true">
          <Skeleton w={72} h={72} round />
          <div className="stack-sm">
            <Skeleton w={170} h={26} />
            <Skeleton w={100} h={14} />
          </div>
        </div>
        <SkeletonCard lines={2} />
      </div>
    </Loading>
  );
}
