export const USERNAME_RE = /^[a-z0-9_]{3,30}$/;
export const USERNAME_RULES = "3 to 30 characters: lowercase letters, numbers and underscores.";

/** Applied on every keystroke: lowercase and drop whitespace. */
export function normalizeUsername(raw: string): string {
  return raw.replace(/\s+/g, "").toLowerCase();
}

export function isValidUsername(u: string): boolean {
  return USERNAME_RE.test(u);
}
