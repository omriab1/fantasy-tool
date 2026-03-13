/**
 * Yahoo Fantasy Sports configuration.
 *
 * Yahoo launches with NBA only. Other sports show "Coming Soon."
 *
 * Yahoo uses "game keys" to identify sports and seasons:
 *   NBA 2024-25: game_key = "428"
 *   NBA 2025-26: game_key = "430" (verify from API at season start)
 *
 * League key format: "{game_key}.l.{league_id}"  e.g. "428.l.19877"
 *
 * Stat window → Yahoo stat_type param mapping (Yahoo uses different names than ESPN):
 *   season     → "season"         (full season totals)
 *   30         → "lastmonth"      (last ~30 days)
 *   14         → "last14days"     (last 14 days)
 *   7          → "lastweek"       (last 7 days — Yahoo calls it "lastweek")
 *   proj       → "projected_stats" (full-season projections — support TBD)
 *
 * ⚠️  VERIFY before going live: confirm game_key for the active NBA season by calling
 *   GET https://fantasysports.yahooapis.com/fantasy/v2/game/nba?format=json
 * and reading fantasy_content.game[0].game_key.
 */

export type YahooSport = "nba";

export interface YahooSportConfig {
  sport: YahooSport;
  name: string;
  emoji: string;
  /** Yahoo game key for the current season (e.g. "428"). Changes each season. */
  gameKey: string;
  /** Current season year (e.g. 2025 for 2024-25 NBA) */
  seasonYear: number;
  /** Enabled in this version of the app */
  enabled: boolean;
  /** Available stat windows in display order */
  availableWindows: YahooWindow[];
  /** Window key → Yahoo API stat_type param */
  windowToStatType: Record<YahooWindow, string>;
}

/** Yahoo stat window keys — parallel to ESPN's StatsWindow */
export type YahooWindow = "season" | "30" | "14" | "7" | "proj";

export const YAHOO_SPORT_CONFIGS: Record<YahooSport, YahooSportConfig> = {
  nba: {
    sport: "nba",
    name: "NBA",
    emoji: "🏀",
    // ⚠️  Verify game_key for the active season via:
    //   GET https://fantasysports.yahooapis.com/fantasy/v2/game/nba?format=json
    // NBA 2024-25 = "428", NBA 2025-26 may be "430"
    gameKey: "428",
    seasonYear: 2025,
    enabled: true,
    availableWindows: ["season", "30", "14", "7"],
    windowToStatType: {
      season: "season",
      "30":   "lastmonth",
      "14":   "last14days",
      "7":    "lastweek",
      proj:   "season", // placeholder — proj may not be available via cookie auth
    },
  },
};

/** Yahoo Fantasy API base URL */
export const YAHOO_API_BASE = "https://fantasysports.yahooapis.com/fantasy/v2";

/** Display label for a Yahoo stat window */
export function yahooWindowLabel(w: YahooWindow): string {
  switch (w) {
    case "season": return "Season";
    case "30":     return "L30d";
    case "14":     return "L14d";
    case "7":      return "L7d";
    case "proj":   return "Proj";
  }
}

/**
 * Parse a Yahoo league_key string into its component parts.
 * Format: "{game_key}.l.{league_id}" e.g. "428.l.19877"
 */
export function parseLeagueKey(key: string): { gameKey: string; leagueId: string } | null {
  const m = key.match(/^(\d+)\.l\.(\d+)$/);
  if (!m) return null;
  return { gameKey: m[1], leagueId: m[2] };
}

/** Validate that a string looks like a Yahoo league key */
export function isValidLeagueKey(key: string): boolean {
  return /^\d+\.l\.\d+$/.test(key);
}
