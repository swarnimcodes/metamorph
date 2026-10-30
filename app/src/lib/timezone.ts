/** The IANA zone the device is in right now (e.g. "Asia/Kolkata"), or UTC if the platform will not say. */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Whether the profile's zone has fallen behind the device's (the person travelled, or never had it set). */
export const zoneNeedsSync = (profileZone: string | null | undefined, device: string): boolean =>
  !!device && profileZone !== device;

/** Minutes ahead of UTC that `zone` is at `instant` ("GMT+05:30" -> 330), or null if the platform cannot say. */
export function utcOffsetMinutes(instant: Date, zone: string): number | null {
  try {
    const name = new Intl.DateTimeFormat("en", { timeZone: zone, timeZoneName: "longOffset" })
      .formatToParts(instant)
      .find((p) => p.type === "timeZoneName")?.value;
    const m = name ? /^GMT(?:([+-])(\d{1,2})(?::(\d{2}))?)?$/.exec(name) : null;
    if (!m) return null;
    if (!m[1]) return 0;
    return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0));
  } catch {
    return null;
  }
}

/**
 * Whether two zones show the same clock at `instant`. Names are not the test: "Asia/Kolkata" and its old
 * alias "Asia/Calcutta" are one zone, and two different zones can agree for part of the year.
 */
export function sameClock(instant: Date, a: string, b: string): boolean {
  if (a === b) return true;
  const [x, y] = [utcOffsetMinutes(instant, a), utcOffsetMinutes(instant, b)];
  return x !== null && x === y;
}
