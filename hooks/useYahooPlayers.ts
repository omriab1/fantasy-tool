"use client";

/**
 * Yahoo Fantasy Players hook.
 *
 * Parallel to usePlayers.ts but for Yahoo Fantasy Sports.
 * Calls /api/yahoo/players and returns PlayerStats[] normalized
 * to be compatible with aggregateStats / calcTradeScore.
 *
 * Stat windows available on Yahoo:
 *   season → "season"   (full season totals)
 *   30     → "lastmonth"
 *   14     → "last14days"
 *   7      → "lastweek"
 *
 * Cache key prefix: "yahoo_" to isolate from ESPN cache.
 */

import { useState, useEffect, useCallback } from "react";
import { cacheGet, cacheSet } from "@/lib/espn-cache";
import { YAHOO_SPORT_CONFIGS } from "@/lib/yahoo-config";
import { getValidYahooToken } from "@/lib/yahoo-auth";
import type { PlayerStats } from "@/lib/types";

export type YahooWindow = "season" | "30" | "14" | "7" | "proj";

function yahooCacheKey(endpoint: string, leagueKey: string, params: string): string {
  return `yahoo_cache_${endpoint}_${leagueKey}_${params}`;
}

export function useYahooPlayers(
  leagueKey: string,
  b: string,
  t: string,
  window: YahooWindow,
) {
  const [players, setPlayers] = useState<PlayerStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cfg = YAHOO_SPORT_CONFIGS.nba;

  const load = useCallback(async () => {
    const accessToken = localStorage.getItem("yahoo_access_token") ?? "";
    if (!leagueKey || (!b && !accessToken)) return;

    const key = yahooCacheKey("players_v2", leagueKey, `nba_${window}`);
    const cached = cacheGet<PlayerStats[]>(key);
    if (cached) {
      setPlayers(cached);
      return;
    }

    setLoading(true);
    setError(null);

    // Auto-refresh token if expired
    const validToken = accessToken ? await getValidYahooToken() : "";
    const authHeaders: Record<string, string> = validToken
      ? { "x-yahoo-access-token": validToken }
      : { "x-yahoo-b": b, "x-yahoo-t": t };

    fetch(
      `/api/yahoo/players?leagueKey=${encodeURIComponent(leagueKey)}&window=${encodeURIComponent(window)}`,
      { headers: authHeaders }
    )
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as Record<string, unknown>;
          const msg = (body.error as string) ?? `HTTP ${res.status}`;
          if (res.status === 401 || res.status === 403) {
            throw new Error("Yahoo credentials rejected. Try reconnecting via Quick Connect in Settings.");
          }
          throw new Error(msg);
        }
        return res.json();
      })
      .then((data: PlayerStats[]) => {
        cacheSet(key, data);
        setPlayers(data);

        // Also cache the other windows from this data if they were fetched
        // (Yahoo fetches one window per request, unlike ESPN which returns all at once)
        // This is fine — each window is fetched separately and cached independently.
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [leagueKey, b, t, window, cfg]);

  // Switch window from cache instantly if available
  useEffect(() => {
    if (!leagueKey || !b) return;
    const key = yahooCacheKey("players_v2", leagueKey, `nba_${window}`);
    const cached = cacheGet<PlayerStats[]>(key);
    if (cached) setPlayers(cached);
  }, [leagueKey, b, window]);

  useEffect(() => {
    load();
  }, [load]);

  return { players, loading, error, reload: load };
}
