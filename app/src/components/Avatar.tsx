import { useState } from "react";

/** Two initials, or the photo when there is one. Strangers never come with a photo, so they get initials. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = [...words[0]][0] ?? "?";
  const last = words.length > 1 ? ([...words[words.length - 1]][0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function Avatar({ name, url, size = 40 }: { name: string; url?: string | null; size?: number }) {
  // A photo that fails to load (a deleted Google picture, no network) falls back to initials.
  const [failed, setFailed] = useState(false);
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4 }} aria-hidden="true">
      {url && !failed ? <img src={url} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : initials(name)}
    </span>
  );
}
