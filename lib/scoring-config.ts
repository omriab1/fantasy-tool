import type { ScoringCat, LeagueScoringConfig } from "./types";

const safe = (n: number, d: number) => (d === 0 ? 0 : n / d);

/**
 * ESPN UI display order for stat IDs — controls the row order shown in the app.
 *
 * Confirmed from ESPN's scoring settings page (all 36 categories, Feb 2026):
 *   GP, GS, MIN, FGM, FGA, FGMI, FG%, AFG%,
 *   FTM, FTA, FTMI, FT%, 3PM, 3PA, 3PMI, 3P%,
 *   OREB, DREB, REB, AST, A/TO, STL, STR, BLK, TO,
 *   EJ, FF, PF, TF, DQ, DD, TD, QD, PTS, PPM, TW
 *
 * To update this order: edit the array below to match whatever ESPN shows.
 * Stat IDs from cwendt94/espn-api STATS_MAP (authoritative reverse-engineered mapping).
 * Any stat ID not listed here will sort to the end (rank 999).
 */
const ESPN_DISPLAY_ORDER: number[] = [
  42, 41, 40,         // GP, GS, MIN
  13, 14, 23, 19, 22, // FGM, FGA, FGMI, FG%, AFG%
  15, 16, 24, 20,     // FTM, FTA, FTMI, FT%
  17, 18, 25, 21,     // 3PM, 3PA, 3PMI, 3P%
  4, 5, 6,            // OREB, DREB, REB
  3, 35,              // AST, A/TO
  2, 36,              // STL, STR
  1,                  // BLK
  11,                 // TO
  7, 8, 9, 10, 12,   // EJ, FF, PF, TF, DQ
  37, 38, 39,         // DD, TD, QD
  0,                  // PTS
  34,                 // PPM
  43,                 // TW
  44,                 // FTR (not in ESPN's 36 confirmed categories — placed last as fallback)
];

const displayRank = (espnStatId: number): number => {
  const idx = ESPN_DISPLAY_ORDER.indexOf(espnStatId);
  return idx === -1 ? 999 : idx;
};

/**
 * Maps ESPN stat IDs to scoring category definitions.
 * Source: cwendt94/espn-api basketball/constant.py STATS_MAP (authoritative reverse-engineered mapping).
 * Confirmed from live ESPN API (league 1476004434, season 2026): stat 22 = AFG%.
 *
 * compute(totals, gp):
 *   totals = accumulated raw stat values (per-game sums in trade mode, weekly totals in compare mode)
 *   gp     = 1 (trade) or number of weeks (compare/power)
 */
export const ESPN_STAT_MAP: Record<number, ScoringCat> = {
  // ── Standard counting stats ─────────────────────────────────────────────
  0:  { id: "PTS",  espnStatId: 0,  lowerIsBetter: false, compute: (t, gp) => safe(t[0],  Math.max(gp, 1)) },
  1:  { id: "BLK",  espnStatId: 1,  lowerIsBetter: false, compute: (t, gp) => safe(t[1],  Math.max(gp, 1)) },
  2:  { id: "STL",  espnStatId: 2,  lowerIsBetter: false, compute: (t, gp) => safe(t[2],  Math.max(gp, 1)) },
  3:  { id: "AST",  espnStatId: 3,  lowerIsBetter: false, compute: (t, gp) => safe(t[3],  Math.max(gp, 1)) },
  4:  { id: "OREB", espnStatId: 4,  lowerIsBetter: false, compute: (t, gp) => safe(t[4],  Math.max(gp, 1)) },
  5:  { id: "DREB", espnStatId: 5,  lowerIsBetter: false, compute: (t, gp) => safe(t[5],  Math.max(gp, 1)) },
  6:  { id: "REB",  espnStatId: 6,  lowerIsBetter: false, compute: (t, gp) => safe(t[6],  Math.max(gp, 1)) },
  11: { id: "TO",   espnStatId: 11, lowerIsBetter: true,  compute: (t, gp) => safe(t[11], Math.max(gp, 1)) },
  // ── Discipline / penalty stats (lower is better) ────────────────────────
  7:  { id: "EJ",   espnStatId: 7,  lowerIsBetter: true,  compute: (t, gp) => safe(t[7],  Math.max(gp, 1)) },
  8:  { id: "FF",   espnStatId: 8,  lowerIsBetter: true,  compute: (t, gp) => safe(t[8],  Math.max(gp, 1)) },
  9:  { id: "PF",   espnStatId: 9,  lowerIsBetter: true,  compute: (t, gp) => safe(t[9],  Math.max(gp, 1)) },
  10: { id: "TF",   espnStatId: 10, lowerIsBetter: true,  compute: (t, gp) => safe(t[10], Math.max(gp, 1)) },
  12: { id: "DQ",   espnStatId: 12, lowerIsBetter: true,  compute: (t, gp) => safe(t[12], Math.max(gp, 1)) },
  // ── Shooting volume stats ───────────────────────────────────────────────
  13: { id: "FGM",  espnStatId: 13, lowerIsBetter: false, compute: (t, gp) => safe(t[13], Math.max(gp, 1)) },
  14: { id: "FGA",  espnStatId: 14, lowerIsBetter: false, compute: (t, gp) => safe(t[14], Math.max(gp, 1)) },
  15: { id: "FTM",  espnStatId: 15, lowerIsBetter: false, compute: (t, gp) => safe(t[15], Math.max(gp, 1)) },
  16: { id: "FTA",  espnStatId: 16, lowerIsBetter: false, compute: (t, gp) => safe(t[16], Math.max(gp, 1)) },
  17: { id: "3PM",  espnStatId: 17, lowerIsBetter: false, compute: (t, gp) => safe(t[17], Math.max(gp, 1)) },
  18: { id: "3PA",  espnStatId: 18, lowerIsBetter: false, compute: (t, gp) => safe(t[18], Math.max(gp, 1)) },
  // ── Percentage stats — volume-weighted via component stat IDs ───────────
  19: { id: "FG%",  espnStatId: 19, lowerIsBetter: false, compute: (t) => safe(t[13], t[14]), volumeStatIds: [13, 14] as const },
  20: { id: "FT%",  espnStatId: 20, lowerIsBetter: false, compute: (t) => safe(t[15], t[16]), volumeStatIds: [15, 16] as const },
  21: { id: "3P%",  espnStatId: 21, lowerIsBetter: false, compute: (t) => safe(t[17], t[18]), volumeStatIds: [17, 18] as const },
  // AFG%/eFG% — confirmed stat ID 22 from live ESPN API inspection.
  22: { id: "AFG%", espnStatId: 22, lowerIsBetter: false, compute: (t) => safe((t[13] ?? 0) + 0.5 * (t[17] ?? 0), t[14] ?? 0) },
  // ── Missed shot stats — derived from attempts minus makes (lower is better) ─
  23: { id: "FGMI", espnStatId: 23, lowerIsBetter: true,  compute: (t, gp) => safe((t[14] ?? 0) - (t[13] ?? 0), Math.max(gp, 1)) },
  24: { id: "FTMI", espnStatId: 24, lowerIsBetter: true,  compute: (t, gp) => safe((t[16] ?? 0) - (t[15] ?? 0), Math.max(gp, 1)) },
  25: { id: "3PMI", espnStatId: 25, lowerIsBetter: true,  compute: (t, gp) => safe((t[18] ?? 0) - (t[17] ?? 0), Math.max(gp, 1)) },
  // ── Ratio stats — derived from component counting stats ─────────────────
  // A/TO and STR are ratio stats; ESPN sends these as stat IDs 35/36 in scoringItems
  // but the raw values come from AST(3)/TO(11) and STL(2)/TO(11) respectively.
  35: { id: "A/TO", espnStatId: 35, lowerIsBetter: false, compute: (t) => safe(t[3]  ?? 0, t[11] ?? 0) },
  36: { id: "STR",  espnStatId: 36, lowerIsBetter: false, compute: (t) => safe(t[2]  ?? 0, t[11] ?? 0) },
  // ── Milestone / bonus stats ─────────────────────────────────────────────
  37: { id: "DD",   espnStatId: 37, lowerIsBetter: false, compute: (t, gp) => safe(t[37], Math.max(gp, 1)) },
  38: { id: "TD",   espnStatId: 38, lowerIsBetter: false, compute: (t, gp) => safe(t[38], Math.max(gp, 1)) },
  39: { id: "QD",   espnStatId: 39, lowerIsBetter: false, compute: (t, gp) => safe(t[39], Math.max(gp, 1)) },
  // ── Game activity stats ─────────────────────────────────────────────────
  40: { id: "MIN",  espnStatId: 40, lowerIsBetter: false, compute: (t, gp) => safe(t[40], Math.max(gp, 1)) },
  41: { id: "GS",   espnStatId: 41, lowerIsBetter: false, compute: (t, gp) => safe(t[41], Math.max(gp, 1)) },
  // GP: rawStats[42] = p.gp so aggregateStats special-cases this to not divide by gp.
  42: { id: "GP",   espnStatId: 42, lowerIsBetter: false, compute: (t, gp) => safe(t[42] ?? 0, Math.max(gp, 1)) },
  43: { id: "TW",   espnStatId: 43, lowerIsBetter: false, compute: (t, gp) => safe(t[43], Math.max(gp, 1)) },
  // PPM = Points Per Minute = PTS / MIN (ratio — ignores gp, volume-weighted from components)
  34: { id: "PPM",  espnStatId: 34, lowerIsBetter: false, compute: (t) => safe(t[0]  ?? 0, t[40] ?? 0) },
  // FTR = Free Throw Rate = FTM / FGA
  44: { id: "FTR",  espnStatId: 44, lowerIsBetter: false, compute: (t) => safe(t[15] ?? 0, t[14] ?? 0) },
};

/**
 * Fallback used when ESPN settings cannot be parsed.
 * Replicates the 9-cat H2H behavior exactly (confirmed stat IDs).
 */
export const DEFAULT_SCORING_CONFIG: LeagueScoringConfig = {
  format: "categories",
  cats: [
    ESPN_STAT_MAP[22], // AFG%
    ESPN_STAT_MAP[20], // FT%
    ESPN_STAT_MAP[17], // 3PM
    ESPN_STAT_MAP[6],  // REB
    ESPN_STAT_MAP[3],  // AST
    ESPN_STAT_MAP[2],  // STL
    ESPN_STAT_MAP[1],  // BLK
    ESPN_STAT_MAP[11], // TO
    ESPN_STAT_MAP[0],  // PTS
  ],
};

/** Returns a one-line human-readable summary of the detected scoring config. */
export function scoringConfigLabel(config: LeagueScoringConfig): string {
  if (config.format === "points") {
    const n = Object.keys(config.pointValues ?? {}).length;
    return `Points league · ${n} scoring stat${n !== 1 ? "s" : ""}`;
  }
  const fmtLabel = config.format === "roto" ? "Roto" : "H2H";
  const catList = config.cats.map((c) => c.id).join(", ");
  return `${config.cats.length}-cat ${fmtLabel} · ${catList}`;
}

/**
 * Parses ESPN league settings → LeagueScoringConfig.
 * Falls back to DEFAULT_SCORING_CONFIG on any parse failure.
 *
 * Confirmed ESPN field names (season 2026):
 *   settings.scoringSettings.scoringType  — e.g. "H2H_MOST_CATEGORIES", "H2H_POINTS", "ROTO"
 *   settings.scoringSettings.scoringItems — array of { statId, isReverseItem, points, ... }
 *
 * IMPORTANT: In H2H categories leagues every scoringItem carries "points": 1 — NOT a points
 * league signal. Format is determined by scoringType only.
 */
export function parseLeagueScoringConfig(settings: unknown): LeagueScoringConfig {
  if (!settings || typeof settings !== "object") return DEFAULT_SCORING_CONFIG;
  const s = settings as Record<string, unknown>;

  const scoringSettings = s.scoringSettings as Record<string, unknown> | undefined;
  if (!scoringSettings) return DEFAULT_SCORING_CONFIG;

  const scoringItems = scoringSettings.scoringItems as unknown[] | undefined;
  if (!Array.isArray(scoringItems) || scoringItems.length === 0) return DEFAULT_SCORING_CONFIG;

  const scoringType =
    (scoringSettings.scoringType as string | undefined) ??
    (s.scoringType as string | undefined) ??
    "";
  const typeLower = scoringType.toLowerCase();

  const isPoints = typeLower.includes("point") && !typeLower.includes("categor");
  const isRoto   = typeLower.includes("roto") || typeLower.includes("rotisserie");

  if (isPoints) {
    const pointValues: Record<number, number> = {};
    const cats: ScoringCat[] = [];
    for (const item of scoringItems) {
      const it = item as Record<string, unknown>;
      const statId = typeof it.statId === "number" ? it.statId : parseInt(String(it.statId), 10);
      const pts    = typeof it.points === "number"  ? it.points  : 0;
      if (isNaN(statId) || pts === 0) continue;
      pointValues[statId] = pts;
      const cat = ESPN_STAT_MAP[statId];
      if (cat) cats.push(cat);
    }
    if (cats.length === 0) return DEFAULT_SCORING_CONFIG;
    cats.sort((a, b) => displayRank(a.espnStatId) - displayRank(b.espnStatId));
    return { format: "points", cats, pointValues };
  }

  // Categories or Roto
  const cats: ScoringCat[] = [];
  for (const item of scoringItems) {
    const it = item as Record<string, unknown>;
    const statId = typeof it.statId === "number" ? it.statId : parseInt(String(it.statId), 10);
    if (isNaN(statId)) continue;

    const cat = ESPN_STAT_MAP[statId];
    if (!cat) {
      // Unknown stat ID — open browser DevTools console to identify missing categories.
      console.warn(`[fantasy-tool] Unknown ESPN stat ID ${statId} — category skipped.`);
      continue;
    }

    // isReverseItem = true means lower is better (e.g. TO, TF).
    // Only override when it differs from the map default.
    const reverse = it.isReverseItem === true;
    cats.push(reverse !== cat.lowerIsBetter ? { ...cat, lowerIsBetter: reverse } : cat);
  }

  if (cats.length < 2) return DEFAULT_SCORING_CONFIG;

  cats.sort((a, b) => displayRank(a.espnStatId) - displayRank(b.espnStatId));
  return { format: isRoto ? "roto" : "categories", cats };
}
