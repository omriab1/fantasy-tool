// ESPN Stat ID mapping
export const STAT_IDS = {
  PTS: 0,
  BLK: 1,
  STL: 2,
  AST: 3,
  REB: 6,
  TO: 11,
  FGM: 13,
  FGA: 14,
  FTM: 15,
  FTA: 16,
  "3PM": 17,
  "3PA": 18,
  GP: 42,
} as const;

// Legacy constant — actual categories are now driven by LeagueScoringConfig
export const CATEGORIES = ["AFG%", "FT%", "3PM", "REB", "AST", "STL", "BLK", "TO", "PTS"] as const;
export type Category = (typeof CATEGORIES)[number];
export const LOWER_IS_BETTER: readonly string[] = ["TO"];

// ─── Scoring config types ─────────────────────────────────────────────────────

export interface ScoringCat {
  /** Display label shown in tables and subtitles, e.g. "PTS", "FG%", "AFG%" */
  id: string;
  /** ESPN stat ID used to look up this category in scoringItems */
  espnStatId: number;
  lowerIsBetter: boolean;
  /**
   * Compute the final category value from raw stat totals.
   * @param totals  Raw ESPN stat totals keyed by stat ID (summed across players or weeks)
   * @param gp      Total games played (sum across players) or number of weeks
   */
  compute: (totals: Record<number, number>, gp: number) => number;
  /**
   * For simple percentage stats (FG%, FT%, 3P%): the [made, attempts] stat IDs.
   * Used to show volume (e.g. "180/240") below the percentage in category tables.
   * Not set for weighted metrics like AFG% where the numerator isn't a single stat.
   */
  volumeStatIds?: readonly [number, number];
}

export interface LeagueScoringConfig {
  format: "categories" | "points" | "roto";
  /** Ordered list of scoring categories for display and comparison */
  cats: ScoringCat[];
  /** statId → points per unit (points leagues only) */
  pointValues?: Record<number, number>;
}

// ─── Player / Stats types ─────────────────────────────────────────────────────

export interface RawStats {
  [statId: number]: number;
}

export interface PlayerStats {
  playerId: number;
  playerName: string;
  teamAbbrev: string;
  position: string;
  // Named fields kept for backwards compatibility
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  to: number;
  threepm: number;
  fgm: number;
  fga: number;
  ftm: number;
  fta: number;
  threepa: number;
  gp: number;
  /** Full ESPN stats dict — every stat ID available for dynamic league support */
  rawStats: Record<number, number>;
}

/** Dynamic stats map: category label → computed value */
export type AggregatedStats = Record<string, number>;

export interface CategoryResult {
  /** Category display label, e.g. "PTS", "FG%", "AFG%" */
  category: string;
  giving: number;
  receiving: number;
  delta: number;
  winner: "receiving" | "giving" | "push";
  lowerIsBetter: boolean;
  /** Raw [made, attempts] volume for the giving side — set for FG%, FT%, 3P% */
  givingVol?: readonly [number, number];
  /** Raw [made, attempts] volume for the receiving side — set for FG%, FT%, 3P% */
  receivingVol?: readonly [number, number];
}

export interface TradeAnalysis {
  results: CategoryResult[];
  winsForReceiving: number;
  losses: number;
  equals: number;
  totalCats: number;
}

export interface LeagueTeam {
  id: number;
  name: string;
  abbreviation: string;
  ownerId: string;
  rosterPlayerIds: number[];
  logo?: string;
}

export interface LeagueInfo {
  leagueId: string;
  seasonId: number;
  scoringPeriodId: number;
  teams: LeagueTeam[];
}

export interface WeeklyTeamStats {
  teamId: number;
  teamName: string;
  stats: AggregatedStats;
}

export interface AppSettings {
  leagueId: string;
  espnS2: string;
  swid: string;
}

export interface PowerMatchup {
  opponentId: number;
  opponentName: string;
  opponentLogo?: string;
  teamCatWins: number;
  oppCatWins: number;
  pushes: number;
  result: "W" | "L" | "T";
}

export interface PowerRankEntry {
  teamId: number;
  teamName: string;
  teamLogo?: string;
  wins: number;
  losses: number;
  ties: number;
  winPct: number;
  matchups: PowerMatchup[];
}

export type EspnSport = "fba" | "wnba" | "flb" | "fhl" | "ffl";

export type StatsWindow = "season" | "30" | "15" | "7" | "proj";

export interface EspnPlayerInfo {
  playerId: number;
  playerName: string;
  teamAbbrev: string;
  position: string;
  stats: {
    [window in StatsWindow]?: PlayerStats;
  };
}
