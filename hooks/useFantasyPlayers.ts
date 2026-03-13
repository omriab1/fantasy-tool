"use client";

/**
 * Provider-aware fantasy players hook.
 *
 * Wraps usePlayers (ESPN) and useYahooPlayers (Yahoo) — both hooks run internally
 * but only the active provider's result is returned.
 *
 * Usage:
 *   const { players, loading, error, reload } = useFantasyPlayers({
 *     provider,
 *     espn: { leagueId, espnS2, swid, window: statsWindow, sport, activeSlotIds },
 *     yahoo: { leagueKey, b, t, window: yahooWindow },
 *   });
 */

import { usePlayers } from "./usePlayers";
import { useYahooPlayers } from "./useYahooPlayers";
import type { PlayerStats, StatsWindow, EspnSport, FantasyProvider } from "@/lib/types";
import type { YahooWindow } from "./useYahooPlayers";

export interface EspnPlayersArgs {
  leagueId: string;
  espnS2: string;
  swid: string;
  window: StatsWindow;
  sport: EspnSport;
  activeSlotIds?: number[];
}

export interface YahooPlayersArgs {
  leagueKey: string;
  b: string;
  t: string;
  /** Accepts StatsWindow — "15" is mapped to Yahoo's "14" internally. */
  window: StatsWindow;
}

export interface UseFantasyPlayersArgs {
  provider: FantasyProvider;
  espn: EspnPlayersArgs;
  yahoo: YahooPlayersArgs;
}

export interface FantasyPlayersResult {
  players: PlayerStats[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useFantasyPlayers({
  provider,
  espn,
  yahoo,
}: UseFantasyPlayersArgs): FantasyPlayersResult {
  // Both hooks always run — only active provider's result is returned.
  const espnResult = usePlayers(
    provider === "espn" ? espn.leagueId : "",
    provider === "espn" ? espn.espnS2 : "",
    provider === "espn" ? espn.swid : "",
    espn.window,
    provider === "espn" ? espn.sport : "fba",
    provider === "espn" ? espn.activeSlotIds : undefined,
  );

  // Yahoo doesn't have a 15-day window — map "15" → "14". "proj" stays as-is (handled by useYahooPlayers).
  const rawWindow = yahoo.window;
  const yahooWindow: YahooWindow =
    rawWindow === "15" ? "14" :
    (rawWindow === "proj" ? "proj" :
    (rawWindow as YahooWindow));

  const yahooResult = useYahooPlayers(
    provider === "yahoo" ? yahoo.leagueKey : "",
    provider === "yahoo" ? yahoo.b : "",
    provider === "yahoo" ? yahoo.t : "",
    yahooWindow,
  );

  return provider === "yahoo" ? yahooResult : espnResult;
}
