import { DEFAULT_SCORING_CONFIG, NHL_STAT_MAP, NHL_DISPLAY_ORDER, NHL_DEFAULT_SCORING_CONFIG } from "./scoring-config";
import type { EspnSport, LeagueScoringConfig, ScoringCat, StatsWindow } from "./types";

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
  /** Sport-specific stat ID map. Defaults to basketball ESPN_STAT_MAP when omitted. */
  statMap?: Record<number, ScoringCat>;
  /** Sport-specific display order for stat categories. Defaults to basketball order when omitted. */
  statDisplayOrder?: number[];
  /** ESPN stat ID used to read GP (games played) from raw player stats.
   *  Basketball = 42, Hockey = 30. Used by usePlayers to filter out zero-GP entries. */
  gpStatId?: number;
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

// ── NHL position maps ─────────────────────────────────────────────────────────
// Confirmed from ESPN Fantasy Hockey API (league 1158022554, season 2026):
//   defPos=1 (C)  eligible: [3, 0, 6, 7, 8]
//   defPos=2 (LW) eligible: [3, 1, 6, 7, 8]
//   defPos=3 (RW) eligible: [3, 2, 6, 7, 8]
//   defPos=4 (D)  eligible: [4,    6, 7, 8]
//   defPos=5 (G)  eligible: [5,       7, 8]
//
// Slot semantics (derived from eligibleSlots):
//   0 = C-only slot   (this league has 0 of these — all forward spots use slot 3)
//   1 = LW-only slot  (0 in this league)
//   2 = RW-only slot  (0 in this league)
//   3 = F (C/LW/RW)  — forward flex, 9 spots
//   4 = D             — 5 spots
//   5 = G             — 2 spots
//   6 = UTIL (C/LW/RW/D, not G) — 1 spot
//   7 = BN (all)      — 5 bench spots
//   8 = IR (all)      — 1 IR spot
const NHL_SLOT_POS: Record<number, string> = {
  0: "C",
  1: "LW",
  2: "RW",
  3: "F",
  4: "D",
  5: "G",
};
// UTIL (6), BN (7) and IR (8) intentionally omitted — they don't add to the displayed position string.

const NHL_POS_MAP: Record<number, string> = {
  1: "C",
  2: "LW",
  3: "RW",
  4: "D",
  5: "G",
};

// Placeholder empty maps for sports not yet fully configured (Phases B/D)
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
  // NHL — Phase C: fully configured (positions + stat IDs confirmed from live ESPN API)
  fhl: {
    sport: "fhl",
    name: "NHL",
    emoji: "🏒",
    seasonYear: 2026,
    cdnLeague: "nhl",
    availableWindows: ["season", "30", "15", "7", "proj"],
    slotPosMap: NHL_SLOT_POS,
    defaultPosMap: NHL_POS_MAP,
    irSlotIds: [8],          // slot 8 = IR (all positions eligible, confirmed from eligibleSlots)
    defaultScoringConfig: NHL_DEFAULT_SCORING_CONFIG,
    statMap: NHL_STAT_MAP,
    statDisplayOrder: NHL_DISPLAY_ORDER,
    gpStatId: 30,            // hockey GP is at stat ID 30 (not 42 like basketball)
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
