const TTL_MS = 15 * 60 * 1000; // 15 minutes

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export function cacheGet<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() > entry.expiresAt) {
      localStorage.removeItem(key);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

export function cacheSet<T>(key: string, data: T): void {
  if (typeof window === "undefined") return;
  try {
    const entry: CacheEntry<T> = { data, expiresAt: Date.now() + TTL_MS };
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // localStorage full or unavailable — silently skip
  }
}

export function cacheKey(endpoint: string, leagueId: string, params: string): string {
  return `espn_cache_${endpoint}_${leagueId}_${params}`;
}

export function clearCache(leagueId: string): void {
  if (typeof window === "undefined") return;
  const prefix = `espn_cache_`;
  Object.keys(localStorage)
    .filter((k) => k.startsWith(prefix) && k.includes(`_${leagueId}_`))
    .forEach((k) => localStorage.removeItem(k));
}

export function clearYahooCache(leagueKey: string): void {
  if (typeof window === "undefined") return;
  const prefix = `yahoo_cache_`;
  Object.keys(localStorage)
    .filter((k) => k.startsWith(prefix) && k.includes(`_${leagueKey}_`))
    .forEach((k) => localStorage.removeItem(k));
}
