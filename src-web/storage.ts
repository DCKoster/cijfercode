const PREFIX = "cijfercode:v3:";
const MIGRATION_MARKER = `${PREFIX}migrated`;

export function migrateLegacyStorage(): void {
  try {
    if (localStorage.getItem(MIGRATION_MARKER)) return;
    localStorage.removeItem("cijfercode:v2:player");
    localStorage.removeItem("cijfercode:v2:booklet");
    localStorage.setItem(MIGRATION_MARKER, "true");
  } catch { /* Storage can be unavailable in private browsing modes. */ }
}

export function loadStored<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(PREFIX + key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    localStorage.removeItem(PREFIX + key);
    return fallback;
  }
}

export function storeValue(key: string, value: unknown): void {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* Private mode/quota: keep the session usable. */ }
}
