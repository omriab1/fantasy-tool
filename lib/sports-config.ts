import { DEFAULT_SCORING_CONFIG } from "./scoring-config";
import type { EspnSport, LeagueScoringConfig, StatsWindow } from "./types";

export interface SportConfig {
  sport: EspnSport;
  name: string;
  emoji: string;
  seasonYear: number;
  availableWindows: StatsWindow[];
  /** eligibleSlots ID → position label */
  slotPosMap: Record<number, string>;
  /** defaultPositionId → position label */
  defaultPosMap: Record<number, string>;
  defaultScoringConfig: LeagueScoringConfig;
}

const NBA_SLOT_POS: Record<number, string> = {
  0: "PG", 1: "SG", 2: "SF", 3: "PF", 4: "C",
};

const NBA_POS_MAP: Record<number, string> = {
  1: "PG", 2: "SG", 3: "SF", 4: "PF", 5: "C",
  6: "PG/SG", 7: "SG/SF", 8: "SF/PF", 9: "PF/C",
};

// Placeholder empty maps for sports not yet fully configured (Phases B/C/D)
const EMPTY_MAP: Record<number, string> = {};

export const SPORT_CONFIGS: Record<EspnSport, SportConfig> = {
  fba: {
    sport: "fba",
    name: "NBA",
    emoji: "🏀",
    seasonYear: 2026,
    availableWindows: ["season", "30", "15", "7"],
    slotPosMap: NBA_SLOT_POS,
    defaultPosMap: NBA_POS_MAP,
    defaultScoringConfig: DEFAULT_SCORING_CONFIG,
  },
  // WNBA: same game mechanics as NBA — same stat IDs and position slot IDs.
  // Season year 2025 (WNBA season lags NBA by ~1 calendar year).
  wnba: {
    sport: "wnba",
    name: "WNBA",
    emoji: "🏀",
    seasonYear: 2025,
    availableWindows: ["season", "30", "15", "7"],
    slotPosMap: NBA_SLOT_POS,
    defaultPosMap: NBA_POS_MAP,
    defaultScoringConfig: DEFAULT_SCORING_CONFIG,
  },
  // MLB — Phase B: fill slotPosMap/defaultPosMap after discovering via /api/espn/debug
  flb: {
    sport: "flb",
    name: "MLB",
    emoji: "⚾",
    seasonYear: 2026,
    availableWindows: ["season", "30", "15", "7"],
    slotPosMap: EMPTY_MAP,
    defaultPosMap: EMPTY_MAP,
    defaultScoringConfig: DEFAULT_SCORING_CONFIG,
  },
  // NHL — Phase C: fill slotPosMap/defaultPosMap after discovering via /api/espn/debug
  fhl: {
    sport: "fhl",
    name: "NHL",
    emoji: "🏒",
    seasonYear: 2026,
    availableWindows: ["season", "30", "15", "7"],
    slotPosMap: EMPTY_MAP,
    defaultPosMap: EMPTY_MAP,
    defaultScoringConfig: DEFAULT_SCORING_CONFIG,
  },
  // NFL — Phase D: weekly windows ("3w","2w","1w") and slotPosMap added in Phase D
  ffl: {
    sport: "ffl",
    name: "NFL",
    emoji: "🏈",
    seasonYear: 2026,
    availableWindows: ["season", "30", "15", "7"],
    slotPosMap: EMPTY_MAP,
    defaultPosMap: EMPTY_MAP,
    defaultScoringConfig: DEFAULT_SCORING_CONFIG,
  },
};
