/**
 * Yahoo Fantasy Basketball — stat ID map and scoring config parser.
 *
 * Yahoo NBA stat IDs (confirmed from python-yahoo-fantasy-api community docs
 * and cross-referenced with live Yahoo Fantasy Basketball API responses):
 *
 *   5  = FGM  (Field Goals Made) — often returned as "made/attempted" fraction string
 *   6  = FGA  (Field Goals Attempted) — synthetic ID used internally when parsing "X/Y" format
 *   7  = FG%  (computed FGM/FGA)
 *   8  = FTM  (Free Throws Made)
 *   9  = FTA  (Free Throws Attempted)
 *   10 = FT%  (computed FTM/FTA)
 *   11 = 3PM  (3-Pointers Made)
 *   12 = 3PA  (3-Point Attempts) — sometimes absent in totals-only leagues
 *   13 = 3P%  (computed 3PM/3PA)
 *   14 = PTS  (Points per game or season total)
 *   15 = REB  (Total Rebounds)
 *   16 = OREB (Offensive Rebounds)
 *   17 = DREB (Defensive Rebounds)
 *   18 = AST  (Assists)
 *   19 = STL  (Steals)
 *   20 = BLK  (Blocks)
 *   21 = TO   (Turnovers)
 *   22 = A/TO (Assist-to-Turnover Ratio)
 *   23 = DD   (Double-Doubles)
 *   24 = TD   (Triple-Doubles)
 *   0  = GP   (Games Played) — returned as stat metadata, not always as a stat entry
 *
 * ⚠️  VERIFY: Run GET /fantasy/v2/game/nba/stat_categories?format=json to confirm IDs.
 *
 * NOTE on FG% / FT% / 3P% in Yahoo responses:
 *   Category leagues: stat_id 5 (FG%) value comes as "168/352" (made/attempted fraction).
 *   Points leagues: stats come back as individual numeric values.
 *   The Yahoo players route normalizes this — splitting "X/Y" into two entries:
 *     rawStats[5] = made (e.g. 168), rawStats[6] = attempted (e.g. 352)
 *   Then the FG% compute function does rawStats[5] / rawStats[6].
 */

import type { ScoringCat, LeagueScoringConfig } from "./types";

const safe = (n: number, d: number) => (d === 0 ? 0 : n / d);

// ── Yahoo NBA stat ID constants ───────────────────────────────────────────────

export const YAHOO_STAT = {
  FGM:  5,   // Field Goals Made (or "FGM/FGA" fraction in category leagues)
  FGA:  6,   // Field Goals Attempted (synthetic — parsed from the "X/Y" value of stat 5)
  FG_PCT: 7, // FG% (some leagues may send this as a pre-computed decimal)
  FTM:  8,   // Free Throws Made (or "FTM/FTA" fraction)
  FTA:  9,   // Free Throws Attempted (synthetic — parsed from stat 8)
  FT_PCT: 10,// FT%
  TPM:  11,  // 3-Pointers Made (sometimes returned as "3PM/3PA")
  TPA:  12,  // 3-Point Attempts (synthetic)
  TP_PCT: 13,// 3P%
  PTS:  14,  // Points
  REB:  15,  // Total Rebounds
  OREB: 16,  // Offensive Rebounds
  DREB: 17,  // Defensive Rebounds
  AST:  18,  // Assists
  STL:  19,  // Steals
  BLK:  20,  // Blocks
  TO:   21,  // Turnovers
  ATO:  22,  // Assist-to-Turnover Ratio
  DD:   23,  // Double-Doubles
  TD:   24,  // Triple-Doubles
  GP:   0,   // Games Played (often in metadata, not in per-stat entries)
} as const;

/**
 * Complete Yahoo NBA stat map.
 * espnStatId field is repurposed as the Yahoo stat ID for provider-agnostic compute functions.
 * For Yahoo, rawStats keys are Yahoo stat IDs (not ESPN stat IDs).
 */
export const YAHOO_NBA_STAT_MAP: Record<number, ScoringCat> = {
  // ── Percentage stats (volume-weighted) ─────────────────────────────────
  // FG%: computed as FGM(5) / FGA(6). Yahoo sends stat_id=5 as "168/352" fraction → parsed as [5]=168, [6]=352.
  [YAHOO_STAT.FGM]: {
    id: "FG%",
    espnStatId: YAHOO_STAT.FGM,
    lowerIsBetter: false,
    compute: (t) => safe(t[YAHOO_STAT.FGM] ?? 0, t[YAHOO_STAT.FGA] ?? 0),
    volumeStatIds: [YAHOO_STAT.FGM, YAHOO_STAT.FGA] as const,
  },
  // FT%: computed as FTM(8) / FTA(9)
  [YAHOO_STAT.FTM]: {
    id: "FT%",
    espnStatId: YAHOO_STAT.FTM,
    lowerIsBetter: false,
    compute: (t) => safe(t[YAHOO_STAT.FTM] ?? 0, t[YAHOO_STAT.FTA] ?? 0),
    volumeStatIds: [YAHOO_STAT.FTM, YAHOO_STAT.FTA] as const,
  },
  // 3P%: computed as 3PM(11) / 3PA(12)
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
    YAHOO_NBA_STAT_MAP[YAHOO_STAT.FGM]!,  // FG%
    YAHOO_NBA_STAT_MAP[YAHOO_STAT.FTM]!,  // FT%
    YAHOO_NBA_STAT_MAP[YAHOO_STAT.TPM]!,  // 3PM
    YAHOO_NBA_STAT_MAP[YAHOO_STAT.PTS]!,  // PTS
    YAHOO_NBA_STAT_MAP[YAHOO_STAT.REB]!,  // REB
    YAHOO_NBA_STAT_MAP[YAHOO_STAT.AST]!,  // AST
    YAHOO_NBA_STAT_MAP[YAHOO_STAT.STL]!,  // STL
    YAHOO_NBA_STAT_MAP[YAHOO_STAT.BLK]!,  // BLK
    YAHOO_NBA_STAT_MAP[YAHOO_STAT.TO]!,   // TO
  ],
};

/**
 * Map a Yahoo stat display_name to a ScoringCat from YAHOO_NBA_STAT_MAP.
 * Used when dynamically building scoring config from league's stat_categories.
 */
const YAHOO_NAME_TO_STAT_ID: Record<string, number> = {
  // Percentage stats
  "FG%":  YAHOO_STAT.FGM,
  "FGP":  YAHOO_STAT.FGM,
  "FG":   YAHOO_STAT.FGM,
  "FT%":  YAHOO_STAT.FTM,
  "FTP":  YAHOO_STAT.FTM,
  "FT":   YAHOO_STAT.FTM,
  "3P%":  YAHOO_STAT.TP_PCT,
  "3PP":  YAHOO_STAT.TP_PCT,
  // Counting stats
  "3PTM": YAHOO_STAT.TPM,
  "3PM":  YAHOO_STAT.TPM,
  "3PT":  YAHOO_STAT.TPM,
  "3PTA": YAHOO_STAT.TPM, // some leagues label 3PM as 3PTA
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
};

/**
 * Parse Yahoo league scoring settings into a LeagueScoringConfig.
 *
 * Yahoo league data structure (relevant part):
 * ```json
 * {
 *   "fantasy_content": {
 *     "league": [
 *       { "league_key": "428.l.19877", ... },
 *       {
 *         "settings": {
 *           "stat_categories": {
 *             "stats": [
 *               { "stat": { "stat_id": 12, "display_name": "PTS", "enabled": "1", ... } },
 *               ...
 *             ]
 *           },
 *           "stat_modifiers": {  // points leagues only
 *             "stats": [
 *               { "stat": { "stat_id": 12, "value": "1" } },
 *               ...
 *             ]
 *           }
 *         }
 *       }
 *     ]
 *   }
 * }
 * ```
 */
export function parseYahooLeagueScoringConfig(yahooSettings: unknown): LeagueScoringConfig {
  try {
    const settings = yahooSettings as Record<string, unknown>;
    const statCats = (settings?.stat_categories as Record<string, unknown>)?.stats as unknown[];
    const statMods = (settings?.stat_modifiers as Record<string, unknown>)?.stats as unknown[];

    if (!Array.isArray(statCats) || statCats.length === 0) {
      return YAHOO_NBA_DEFAULT_SCORING_CONFIG;
    }

    // Check if this is a points league (has stat_modifiers with point values)
    const isPoints = Array.isArray(statMods) && statMods.length > 0;

    if (isPoints) {
      // Points league: build pointValues map from stat_modifiers
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
