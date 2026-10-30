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
