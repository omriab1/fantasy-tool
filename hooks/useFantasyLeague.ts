"use client";

/**
 * Provider-aware fantasy league hook.
 *
 * Wraps useLeague (ESPN) and useYahooLeague (Yahoo) — both hooks run internally
 * but only the active provider's result is returned. This avoids conditional
 * hook calls (which React disallows) while keeping page code clean.
 *
 * Usage:
 *   const provider = localStorage.getItem("fantasy_provider") ?? "espn";
 *   const { league, scoringConfig, loading, error } = useFantasyLeague({
 *     provider,
 *     espn: { leagueId, espnS2, swid, sport },
 *     yahoo: { leagueKey, b, t },
 *   });
 */

import { useLeague } from "./useLeague";
import { useYahooLeague } from "./useYahooLeague";
import type { EspnSport, LeagueInfo, LeagueScoringConfig } from "@/lib/types";
import type { FantasyProvider } from "@/lib/types";

export interface EspnLeagueArgs {
  leagueId: string;
  espnS2: string;
  swid: string;
  sport: EspnSport;
}

export interface YahooLeagueArgs {
  leagueKey: string;
  b: string;
  t: string;
}

export interface UseFantasyLeagueArgs {
  provider: FantasyProvider;
  espn: EspnLeagueArgs;
  yahoo: YahooLeagueArgs;
}

export interface FantasyLeagueResult {
  league: LeagueInfo | null;
  scoringConfig: LeagueScoringConfig;
  loading: boolean;
  error: string | null;
}

export function useFantasyLeague({
  provider,
  espn,
  yahoo,
}: UseFantasyLeagueArgs): FantasyLeagueResult {
  // Both hooks always run (React rules) — only active provider's result is returned.
  // Inactive provider gets empty/no-op args so it doesn't trigger real fetches.
  const espnResult = useLeague(
    provider === "espn" ? espn.leagueId : "",
    provider === "espn" ? espn.espnS2 : "",
    provider === "espn" ? espn.swid : "",
    provider === "espn" ? espn.sport : "fba",
  );

  const yahooResult = useYahooLeague(
    provider === "yahoo" ? yahoo.leagueKey : "",
    provider === "yahoo" ? yahoo.b : "",
    provider === "yahoo" ? yahoo.t : "",
  );

  return provider === "yahoo" ? yahooResult : espnResult;
}
