// The only module that touches persisted credentials. Swap the body of
// load/save/clear for secure storage (e.g. a Tauri plugin) later.

export interface StoredSession {
  accessToken: string;
  refreshToken: string | null;
  username: string | null;
}

const KEY = "metamorph.session";
let memory: StoredSession | null = null;

export function loadSession(): StoredSession | null {
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) memory = JSON.parse(raw) as StoredSession;
  } catch {
    /* storage unavailable or corrupt: behave as logged out */
  }
  return memory;
}

export function saveSession(s: StoredSession): void {
  memory = s;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* keep the in-memory copy for this page load */
  }
}

export function clearSession(): void {
  memory = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
