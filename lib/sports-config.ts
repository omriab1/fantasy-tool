import { DEFAULT_SCORING_CONFIG } from "./scoring-config";
import type { EspnSport, LeagueScoringConfig, StatsWindow } from "./types";

// WNBA is a points-only league on ESPN. This fallback is used when the live
// league hasn't loaded yet — it ensures the UI shows "Points league" not the
// NBA category default. The real point values come from ESPN once the league loads.
const WNBA_DEFAULT_SCORING_CONFIG: LeagueScoringConfig = {
  format: "points",
  cats: [],
  pointValues: {},
};

export interface SportConfig {
  sport: EspnSport;
  name: string;
  emoji: string;
  seasonYear: number;
  /** When ESPN stats live under a different year than the league year (e.g. WNBA off-season) */
  statsFallbackYear?: number;
  /** Override the ESPN API base URL. */
  apiBase?: string;
  /** Override the ESPN API game segment in the URL path.
   *  WNBA fantasy uses "wfba" in the URL even though the ESPN sport code is "wnba". */
  urlSegment?: string;
  /** ESPN CDN folder name for headshots + team logos (e.g. "nba", "wnba"). */
  cdnLeague: string;
  availableWindows: StatsWindow[];
  /** eligibleSlots ID → position label */
  slotPosMap: Record<number, string>;
  /** defaultPositionId → position label */
  defaultPosMap: Record<number, string>;
  /** lineupSlotIds that represent IR/injured spots — players in these slots are excluded from roster calculations */
  irSlotIds: number[];
  defaultScoringConfig: LeagueScoringConfig;
}

/** Returns the ESPN API URL game segment for a sport config.
 *  Uses urlSegment override when set (e.g. WNBA uses "wfba" not "wnba"). */
export function apiSegment(cfg: SportConfig): string {
  return cfg.urlSegment ?? cfg.sport;
}

/** Returns the ESPN API base URL for a sport config (differs per sport). */
export const ESPN_DEFAULT_BASE = "https://lm-api-reads.fantasy.espn.com/apis/v3";
export function apiBase(cfg: SportConfig): string {
  return cfg.apiBase ?? ESPN_DEFAULT_BASE;
}

const NBA_SLOT_POS: Record<number, string> = {
  0: "PG", 1: "SG", 2: "SF", 3: "PF", 4: "C",
};

const NBA_POS_MAP: Record<number, string> = {
  1: "PG", 2: "SG", 3: "SF", 4: "PF", 5: "C",
  6: "PG/SG", 7: "SG/SF", 8: "SF/PF", 9: "PF/C",
};

// WNBA uses single G/F/C positions only. Empty slotPosMap so eligible slots
// don't append additional positions (e.g. avoid "G, G/F" duplicates).
const WNBA_SLOT_POS: Record<number, string> = {};

const WNBA_POS_MAP: Record<number, string> = {
  1: "G", 2: "F", 3: "C", 4: "G", 5: "F",  // G/F → G, F/C → F
};

// Placeholder empty maps for sports not yet fully configured (Phases B/C/D)
const EMPTY_MAP: Record<number, string> = {};

export const SPORT_CONFIGS: Record<EspnSport, SportConfig> = {
  fba: {
    sport: "fba",
    name: "NBA",
    emoji: "🏀",
    seasonYear: 2026,
    cdnLeague: "nba",
    availableWindows: ["season", "30", "15", "7", "proj"],
    slotPosMap: NBA_SLOT_POS,
    defaultPosMap: NBA_POS_MAP,
    irSlotIds: [13, 20, 21],   // slot 13 = IL (some leagues), slot 20 = IL, slot 21 = IL+ in ESPN NBA
    defaultScoringConfig: DEFAULT_SCORING_CONFIG,
  },
  // WNBA: ESPN Fantasy WNBA lives at fantasy.espn.com/womens-basketball/ — but uses the same
  // lm-api-reads.fantasy.espn.com API host as NBA, with the "wnba" game segment.
  // Pre-season 2026 league year with statsFallbackYear:2025 for historical stats.
  wnba: {
    sport: "wnba",
    name: "WNBA",
    emoji: "🏀",
    seasonYear: 2026,        // WNBA 2026 pre-season
    statsFallbackYear: 2025, // completed stats from the 2025 season
    urlSegment: "wfba",      // ESPN Fantasy WNBA uses "wfba" in the API URL (not "wnba")
    cdnLeague: "wnba",
    availableWindows: ["season", "30", "15", "7", "proj"],
    slotPosMap: WNBA_SLOT_POS,
    defaultPosMap: WNBA_POS_MAP,
    irSlotIds: [13, 20, 21],
    defaultScoringConfig: WNBA_DEFAULT_SCORING_CONFIG,
  },
  // MLB — Phase B: fill slotPosMap/defaultPosMap after discovering via /api/espn/debug
  flb: {
    sport: "flb",
    name: "MLB",
    emoji: "⚾",
    seasonYear: 2026,
    cdnLeague: "mlb",
    availableWindows: ["season", "30", "15", "7", "proj"],
    slotPosMap: EMPTY_MAP,
    defaultPosMap: EMPTY_MAP,
    irSlotIds: [],
    defaultScoringConfig: DEFAULT_SCORING_CONFIG,
  },
  // NHL — Phase C: fill slotPosMap/defaultPosMap after discovering via /api/espn/debug
  fhl: {
    sport: "fhl",
    name: "NHL",
    emoji: "🏒",
    seasonYear: 2026,
    cdnLeague: "nhl",
    availableWindows: ["season", "30", "15", "7", "proj"],
    slotPosMap: EMPTY_MAP,
    defaultPosMap: EMPTY_MAP,
    irSlotIds: [],
    defaultScoringConfig: DEFAULT_SCORING_CONFIG,
  },
  // NFL — Phase D: weekly windows ("3w","2w","1w") and slotPosMap added in Phase D
  ffl: {
    sport: "ffl",
    name: "NFL",
    emoji: "🏈",
    seasonYear: 2026,
    cdnLeague: "nfl",
    availableWindows: ["season", "30", "15", "7", "proj"],
    slotPosMap: EMPTY_MAP,
    defaultPosMap: EMPTY_MAP,
    irSlotIds: [],
    defaultScoringConfig: DEFAULT_SCORING_CONFIG,
  },
};

/**
 * Returns a contextual note for a stats window during an off-season.
 * Used in the trade analyzer to explain why players may not load or stats are from a past year.
 */
export function getStatsWindowNote(cfg: SportConfig, window: StatsWindow): string | null {
  if (!cfg.statsFallbackYear || cfg.statsFallbackYear >= cfg.seasonYear) return null;
  if (window === "season") return `Showing ${cfg.statsFallbackYear} season stats — the ${cfg.name} ${cfg.seasonYear} season hasn't started yet`;
  if (window === "proj") return `ESPN ${cfg.seasonYear} projections aren't available yet`;
  return `${window}-day stats aren't available yet — the ${cfg.name} ${cfg.seasonYear} season hasn't started`;
}
