/**
 * Yahoo Fantasy Basketball — stat ID map and scoring config parser.
 *
 * Yahoo NBA stat IDs (confirmed from live /players;out=stats API response,
 * cross-verified against Tyrese Maxey, Luka Doncic, Nikola Jokic 2024-25 season totals):
 *
 *   0  = GP   (Games Played)
 *   2  = MIN  (Minutes — total, not per game)
 *   3  = FGA  (Field Goals Attempted)
 *   4  = FGM  (Field Goals Made)
 *   5  = FG%  (decimal, e.g. ".461")
 *   6  = FTA  (Free Throws Attempted)
 *   7  = FTM  (Free Throws Made)
 *   8  = FT%  (decimal)
 *   9  = 3PA  (3-Point Attempts)
 *   10 = 3PM  (3-Pointers Made)
 *   11 = 3P%  (decimal)
 *   12 = PTS  (Points — season total)
 *   13 = OREB (Offensive Rebounds)
 *   14 = DREB (Defensive Rebounds)
 *   15 = REB  (Total Rebounds)
 *   16 = AST  (Assists)
 *   17 = STL  (Steals)
 *   18 = BLK  (Blocks)
 *   19 = TO   (Turnovers)
 *   22 = A/TO (Assist-to-Turnover Ratio — unconfirmed)
 *   27 = DD   (Double-Doubles)
 *   28 = TD   (Triple-Doubles)
 */

import type { ScoringCat, LeagueScoringConfig } from "./types";

const safe = (n: number, d: number) => (d === 0 ? 0 : n / d);

// ── Yahoo NBA stat ID constants ───────────────────────────────────────────────

export const YAHOO_STAT = {
  GP:     0,   // Games Played
  MIN:    2,   // Minutes played (total)
  FGA:    3,   // Field Goals Attempted
  FGM:    4,   // Field Goals Made
  FG_PCT: 5,   // FG% (decimal, e.g. ".461")
  FTA:    6,   // Free Throws Attempted
  FTM:    7,   // Free Throws Made
  FT_PCT: 8,   // FT% (decimal)
  TPA:    9,   // 3-Point Attempts
  TPM:    10,  // 3-Pointers Made
  TP_PCT: 11,  // 3P% (decimal)
  PTS:    12,  // Points (season total)
  OREB:   13,  // Offensive Rebounds
  DREB:   14,  // Defensive Rebounds
  REB:    15,  // Total Rebounds
  AST:    16,  // Assists
  STL:    17,  // Steals
  BLK:    18,  // Blocks
  TO:     19,  // Turnovers
  ATO:    22,  // Assist-to-Turnover Ratio (unconfirmed)
  DD:     27,  // Double-Doubles
  TD:     28,  // Triple-Doubles
} as const;

/**
 * Complete Yahoo NBA stat map.
 * espnStatId field is repurposed as the Yahoo stat ID for provider-agnostic compute functions.
 * For Yahoo, rawStats keys are Yahoo stat IDs (not ESPN stat IDs).
 */
export const YAHOO_NBA_STAT_MAP: Record<number, ScoringCat> = {
  // ── Percentage stats (volume-weighted) ─────────────────────────────────
  // FG%: computed as FGM(4) / FGA(3). Yahoo sends FG% decimal at stat_id 5; we use raw counts.
  [YAHOO_STAT.FG_PCT]: {
    id: "FG%",
    espnStatId: YAHOO_STAT.FG_PCT,
    lowerIsBetter: false,
    compute: (t) => safe(t[YAHOO_STAT.FGM] ?? 0, t[YAHOO_STAT.FGA] ?? 0),
    volumeStatIds: [YAHOO_STAT.FGM, YAHOO_STAT.FGA] as const,
  },
  // FT%: computed as FTM(7) / FTA(6)
  [YAHOO_STAT.FT_PCT]: {
    id: "FT%",
    espnStatId: YAHOO_STAT.FT_PCT,
    lowerIsBetter: false,
    compute: (t) => safe(t[YAHOO_STAT.FTM] ?? 0, t[YAHOO_STAT.FTA] ?? 0),
    volumeStatIds: [YAHOO_STAT.FTM, YAHOO_STAT.FTA] as const,
  },
  // 3P%: computed as 3PM(10) / 3PA(9)
  [YAHOO_STAT.TP_PCT]: {
    id: "3P%",
    espnStatId: YAHOO_STAT.TP_PCT,
    lowerIsBetter: false,
    compute: (t) => safe(t[YAHOO_STAT.TPM] ?? 0, t[YAHOO_STAT.TPA] ?? 0),
    volumeStatIds: [YAHOO_STAT.TPM, YAHOO_STAT.TPA] as const,
  },
  // A/TO ratio
  [YAHOO_STAT.ATO]: {
    id: "A/TO",
    espnStatId: YAHOO_STAT.ATO,
    lowerIsBetter: false,
    compute: (t) => safe(t[YAHOO_STAT.AST] ?? 0, t[YAHOO_STAT.TO] ?? 0),
  },

  // ── Counting stats (per game) ──────────────────────────────────────────
  [YAHOO_STAT.FGA]: {
    id: "FGA",
    espnStatId: YAHOO_STAT.FGA,
    lowerIsBetter: false,
    compute: (t, gp) => safe(t[YAHOO_STAT.FGA] ?? 0, Math.max(gp, 1)),
  },
  [YAHOO_STAT.FGM]: {
    id: "FGM",
    espnStatId: YAHOO_STAT.FGM,
    lowerIsBetter: false,
    compute: (t, gp) => safe(t[YAHOO_STAT.FGM] ?? 0, Math.max(gp, 1)),
  },
  [YAHOO_STAT.FTA]: {
    id: "FTA",
    espnStatId: YAHOO_STAT.FTA,
    lowerIsBetter: false,
    compute: (t, gp) => safe(t[YAHOO_STAT.FTA] ?? 0, Math.max(gp, 1)),
  },
  [YAHOO_STAT.FTM]: {
    id: "FTM",
    espnStatId: YAHOO_STAT.FTM,
    lowerIsBetter: false,
    compute: (t, gp) => safe(t[YAHOO_STAT.FTM] ?? 0, Math.max(gp, 1)),
  },
  [YAHOO_STAT.TPA]: {
    id: "3PA",
    espnStatId: YAHOO_STAT.TPA,
    lowerIsBetter: false,
    compute: (t, gp) => safe(t[YAHOO_STAT.TPA] ?? 0, Math.max(gp, 1)),
  },
  [YAHOO_STAT.TPM]: {
    id: "3PM",
    espnStatId: YAHOO_STAT.TPM,
    lowerIsBetter: false,
    compute: (t, gp) => safe(t[YAHOO_STAT.TPM] ?? 0, Math.max(gp, 1)),
  },
  [YAHOO_STAT.PTS]: {
    id: "PTS",
    espnStatId: YAHOO_STAT.PTS,
    lowerIsBetter: false,
    compute: (t, gp) => safe(t[YAHOO_STAT.PTS] ?? 0, Math.max(gp, 1)),
  },
  [YAHOO_STAT.REB]: {
    id: "REB",
    espnStatId: YAHOO_STAT.REB,
    lowerIsBetter: false,
    compute: (t, gp) => safe(t[YAHOO_STAT.REB] ?? 0, Math.max(gp, 1)),
  },
  [YAHOO_STAT.OREB]: {
    id: "OREB",
    espnStatId: YAHOO_STAT.OREB,
    lowerIsBetter: false,
    compute: (t, gp) => safe(t[YAHOO_STAT.OREB] ?? 0, Math.max(gp, 1)),
  },
  [YAHOO_STAT.DREB]: {
    id: "DREB",
    espnStatId: YAHOO_STAT.DREB,
    lowerIsBetter: false,
    compute: (t, gp) => safe(t[YAHOO_STAT.DREB] ?? 0, Math.max(gp, 1)),
  },
  [YAHOO_STAT.AST]: {
    id: "AST",
    espnStatId: YAHOO_STAT.AST,
    lowerIsBetter: false,
    compute: (t, gp) => safe(t[YAHOO_STAT.AST] ?? 0, Math.max(gp, 1)),
  },
  [YAHOO_STAT.STL]: {
    id: "STL",
    espnStatId: YAHOO_STAT.STL,
    lowerIsBetter: false,
    compute: (t, gp) => safe(t[YAHOO_STAT.STL] ?? 0, Math.max(gp, 1)),
  },
  [YAHOO_STAT.BLK]: {
    id: "BLK",
    espnStatId: YAHOO_STAT.BLK,
    lowerIsBetter: false,
    compute: (t, gp) => safe(t[YAHOO_STAT.BLK] ?? 0, Math.max(gp, 1)),
  },
  [YAHOO_STAT.TO]: {
    id: "TO",
    espnStatId: YAHOO_STAT.TO,
    lowerIsBetter: true,
    compute: (t, gp) => safe(t[YAHOO_STAT.TO] ?? 0, Math.max(gp, 1)),
  },
  [YAHOO_STAT.DD]: {
    id: "DD",
    espnStatId: YAHOO_STAT.DD,
    lowerIsBetter: false,
    compute: (t, gp) => safe(t[YAHOO_STAT.DD] ?? 0, Math.max(gp, 1)),
  },
  [YAHOO_STAT.TD]: {
    id: "TD",
    espnStatId: YAHOO_STAT.TD,
    lowerIsBetter: false,
    compute: (t, gp) => safe(t[YAHOO_STAT.TD] ?? 0, Math.max(gp, 1)),
  },
  [YAHOO_STAT.MIN]: {
    id: "MIN",
    espnStatId: YAHOO_STAT.MIN,
    lowerIsBetter: false,
    compute: (t, gp) => safe(t[YAHOO_STAT.MIN] ?? 0, Math.max(gp, 1)),
  },
  [YAHOO_STAT.GP]: {
    id: "GP",
    espnStatId: YAHOO_STAT.GP,
    lowerIsBetter: false,
    compute: (t) => t[YAHOO_STAT.GP] ?? 0,
  },
};

/** Default Yahoo NBA scoring config (standard 9-cat league) */
export const YAHOO_NBA_DEFAULT_SCORING_CONFIG: LeagueScoringConfig = {
  format: "categories",
  cats: [
    YAHOO_NBA_STAT_MAP[YAHOO_STAT.FG_PCT]!,  // FG%
    YAHOO_NBA_STAT_MAP[YAHOO_STAT.FT_PCT]!,  // FT%
    YAHOO_NBA_STAT_MAP[YAHOO_STAT.TPM]!,     // 3PM
    YAHOO_NBA_STAT_MAP[YAHOO_STAT.PTS]!,     // PTS
    YAHOO_NBA_STAT_MAP[YAHOO_STAT.REB]!,     // REB
    YAHOO_NBA_STAT_MAP[YAHOO_STAT.AST]!,     // AST
    YAHOO_NBA_STAT_MAP[YAHOO_STAT.STL]!,     // STL
    YAHOO_NBA_STAT_MAP[YAHOO_STAT.BLK]!,     // BLK
    YAHOO_NBA_STAT_MAP[YAHOO_STAT.TO]!,      // TO
  ],
};

/**
 * Map a Yahoo stat display_name to a ScoringCat from YAHOO_NBA_STAT_MAP.
 * Used when dynamically building scoring config from league's stat_categories.
 */
const YAHOO_NAME_TO_STAT_ID: Record<string, number> = {
  // Percentage stats
  "FG%":  YAHOO_STAT.FG_PCT,
  "FGP":  YAHOO_STAT.FG_PCT,
  "FT%":  YAHOO_STAT.FT_PCT,
  "FTP":  YAHOO_STAT.FT_PCT,
  "3P%":  YAHOO_STAT.TP_PCT,
  "3PP":  YAHOO_STAT.TP_PCT,
  // Shooting volume
  "FGM":  YAHOO_STAT.FGM,
  "FGA":  YAHOO_STAT.FGA,
  "FTM":  YAHOO_STAT.FTM,
  "FTA":  YAHOO_STAT.FTA,
  // 3-point
  "3PTM": YAHOO_STAT.TPM,
  "3PM":  YAHOO_STAT.TPM,
  "3PT":  YAHOO_STAT.TPM,
  "3PTA": YAHOO_STAT.TPM,
  "3PA":  YAHOO_STAT.TPA,
  // Standard counting
  "PTS":  YAHOO_STAT.PTS,
  "REB":  YAHOO_STAT.REB,
  "OREB": YAHOO_STAT.OREB,
  "DREB": YAHOO_STAT.DREB,
  "AST":  YAHOO_STAT.AST,
  "STL":  YAHOO_STAT.STL,
  "ST":   YAHOO_STAT.STL,
  "BLK":  YAHOO_STAT.BLK,
  "TO":   YAHOO_STAT.TO,
  "A/TO": YAHOO_STAT.ATO,
  "DD":   YAHOO_STAT.DD,
  "TD":   YAHOO_STAT.TD,
  "GP":   YAHOO_STAT.GP,
  "MIN":  YAHOO_STAT.MIN,
  "MINUTES": YAHOO_STAT.MIN,
};

/**
 * Yahoo returns "arrays" as objects: { "0": item, "1": item, ..., "count": N }.
 * This helper normalises both real arrays and that object format to unknown[].
 */
function yahooObjToArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const count = Number(o.count ?? 0);
    const result: unknown[] = [];
    for (let i = 0; i < count; i++) {
      if (o[String(i)] !== undefined) result.push(o[String(i)]);
    }
    return result;
  }
  return [];
}

/**
 * Parse Yahoo league scoring settings into a LeagueScoringConfig.
 */
export function parseYahooLeagueScoringConfig(yahooSettings: unknown): LeagueScoringConfig {
  try {
    const settings = yahooSettings as Record<string, unknown>;
    const statCats = yahooObjToArray((settings?.stat_categories as Record<string, unknown>)?.stats);
    const statMods = yahooObjToArray((settings?.stat_modifiers as Record<string, unknown>)?.stats);

    if (statCats.length === 0) {
      return YAHOO_NBA_DEFAULT_SCORING_CONFIG;
    }

    // Check if this is a points league (has stat_modifiers with point values)
    const isPoints = statMods.length > 0;

    if (isPoints) {
      const pointValues: Record<number, number> = {};
      for (const mod of statMods) {
        const s = (mod as Record<string, unknown>).stat as Record<string, unknown> | undefined;
        if (!s) continue;
        const sid = Number(s.stat_id);
        const val = parseFloat(String(s.value ?? "0"));
        if (!isNaN(sid) && !isNaN(val) && val !== 0) {
          pointValues[sid] = val;
        }
      }
      return { format: "points", cats: [], pointValues };
    }

    // Category league: build cats from enabled stat_categories
    const cats: ScoringCat[] = [];
    for (const entry of statCats) {
      const s = (entry as Record<string, unknown>).stat as Record<string, unknown> | undefined;
      if (!s) continue;

      const enabled = String(s.enabled ?? "1") === "1";
      const isDisplay = String(s.is_only_display_stat ?? "0") === "1";
      if (!enabled || isDisplay) continue;

      const displayName = String(s.display_name ?? "").trim().toUpperCase();
      const sid = Number(s.stat_id);

      // Try to find by display_name first, then by stat_id
      const mappedId = YAHOO_NAME_TO_STAT_ID[displayName] ?? (YAHOO_NBA_STAT_MAP[sid] ? sid : undefined);
      if (mappedId === undefined) continue;

      const cat = YAHOO_NBA_STAT_MAP[mappedId];
      if (cat && !cats.find(c => c.id === cat.id)) {
        cats.push(cat);
      }
    }

    if (cats.length === 0) return YAHOO_NBA_DEFAULT_SCORING_CONFIG;
    return { format: "categories", cats };
  } catch {
    return YAHOO_NBA_DEFAULT_SCORING_CONFIG;
  }
}
