/** The typed confirmation matches the account's username; case and surrounding space do not matter (the server agrees). */
export const matchesUsername = (typed: string, username: string | null | undefined): boolean =>
  !!username && typed.trim().toLowerCase() === username.toLowerCase();
