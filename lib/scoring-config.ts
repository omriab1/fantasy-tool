import type { ScoringCat, LeagueScoringConfig } from "./types";

const safe = (n: number, d: number) => (d === 0 ? 0 : n / d);

// ─── NHL Hockey Stat Map ───────────────────────────────────────────────────────
// Stat IDs discovered from live ESPN Fantasy Hockey API (league 1158022554, season 2026).
// Goalie stats 0-12 are completely different from basketball's 0-12.
// Confirmation method: cross-referenced raw values against known NHL player stats.
//
// Display order for the UI — controls row order in trade/compare/power pages.
// Skater stats first, then goalie stats (matches ESPN's typical category order).
export const NHL_DISPLAY_ORDER: number[] = [
  13, 14, 16,         // G, A, PTS
  15,                 // +/-
  31,                 // PIM
  17, 18,             // PPP, SHP
  19, 20, 21, 22,     // GWG, OTG, SHG, SHA (uncertain IDs)
  29,                 // SOG
  32, 33,             // HIT, BLK
  23, 24,             // FOW, FOL
  25, 26, 27,         // TOI stats
  35, 36, 37, 38, 39, // misc skater (uncertain)
  30,                 // GP (skater/goalie shared)
  0,                  // GS (goalie games started)
  1, 2, 9,            // W, L, OTL
  3, 4, 10, 6, 11, 7, 8, 12, // SA, GA, GAA, SV, SV%, SO, TOI, W%
  5, 28,              // unknown / rarely used
];

const nhlRank = (espnStatId: number): number => {
  const idx = NHL_DISPLAY_ORDER.indexOf(espnStatId);
  return idx === -1 ? 999 : idx;
};

/**
 * ESPN Fantasy Hockey stat ID map.
 * IDs confirmed from live ESPN API response for an NHL fantasy league (season 2026).
 *
 * GOALIE stats (IDs 0–12):
 *   Confirmed: GS(0), W(1), L(2), SA(3), GA(4), SV(6), SO(7), TOI_sec(8), OTL(9), GAA(10), SV%(11), W%(12)
 *   Unknown:   5 (isReverseItem=true in scoring settings, not present in player data — possibly Bad Starts)
 *
 * SKATER stats (IDs 13+):
 *   Confirmed: G(13), A(14), PTS(16), FOW(23), FOL(24), SOG(29), HIT(32), BLK(33), GP(30)
 *   Hypothesis: +/-(15), PPP(17), SHP(18), PIM(31), GWG(19), TOI_min(25)
 *   Uncertain:  20, 21, 22 (very small values), 26, 27 (TOI variants), 28, 35–39
 */
export const NHL_STAT_MAP: Record<number, ScoringCat> = {
  // ── Goalie — counting stats ──────────────────────────────────────────────
  0:  { id: "GS",   espnStatId: 0,  lowerIsBetter: false, compute: (t, gp) => safe(t[0]  ?? 0, Math.max(gp, 1)) },
  1:  { id: "W",    espnStatId: 1,  lowerIsBetter: false, compute: (t, gp) => safe(t[1]  ?? 0, Math.max(gp, 1)) },
  2:  { id: "L",    espnStatId: 2,  lowerIsBetter: true,  compute: (t, gp) => safe(t[2]  ?? 0, Math.max(gp, 1)) },
  3:  { id: "SA",   espnStatId: 3,  lowerIsBetter: false, compute: (t, gp) => safe(t[3]  ?? 0, Math.max(gp, 1)) },
  4:  { id: "GA",   espnStatId: 4,  lowerIsBetter: true,  compute: (t, gp) => safe(t[4]  ?? 0, Math.max(gp, 1)) },
  5:  { id: "BS",   espnStatId: 5,  lowerIsBetter: true,  compute: (t, gp) => safe(t[5]  ?? 0, Math.max(gp, 1)) },
  6:  { id: "SV",   espnStatId: 6,  lowerIsBetter: false, compute: (t, gp) => safe(t[6]  ?? 0, Math.max(gp, 1)) },
  7:  { id: "SO",   espnStatId: 7,  lowerIsBetter: false, compute: (t, gp) => safe(t[7]  ?? 0, Math.max(gp, 1)) },
  // TOI in seconds (raw total per goalie) — per-game avg shown when gp > 1
  8:  { id: "GTOI", espnStatId: 8,  lowerIsBetter: false, compute: (t, gp) => safe(t[8]  ?? 0, Math.max(gp, 1)) },
  9:  { id: "OTL",  espnStatId: 9,  lowerIsBetter: true,  compute: (t, gp) => safe(t[9]  ?? 0, Math.max(gp, 1)) },
  // GAA = GA × 3600 / TOI_sec (volume-weighted across multiple goalies)
  10: { id: "GAA",  espnStatId: 10, lowerIsBetter: true,  compute: (t) => safe((t[4] ?? 0) * 3600, t[8] ?? 0) },
  // SV% = SV / SA (volume-weighted)
  11: { id: "SV%",  espnStatId: 11, lowerIsBetter: false, compute: (t) => safe(t[6] ?? 0, t[3] ?? 0), volumeStatIds: [6, 3] as const },
  // W% = W / (W + L + OTL)
  12: { id: "W%",   espnStatId: 12, lowerIsBetter: false, compute: (t) => safe(t[1] ?? 0, (t[1] ?? 0) + (t[2] ?? 0) + (t[9] ?? 0)) },

  // ── Skater — confirmed ───────────────────────────────────────────────────
  13: { id: "G",    espnStatId: 13, lowerIsBetter: false, compute: (t, gp) => safe(t[13] ?? 0, Math.max(gp, 1)) },
  14: { id: "A",    espnStatId: 14, lowerIsBetter: false, compute: (t, gp) => safe(t[14] ?? 0, Math.max(gp, 1)) },
  16: { id: "PTS",  espnStatId: 16, lowerIsBetter: false, compute: (t, gp) => safe(t[16] ?? 0, Math.max(gp, 1)) },
  23: { id: "FOW",  espnStatId: 23, lowerIsBetter: false, compute: (t, gp) => safe(t[23] ?? 0, Math.max(gp, 1)) },
  24: { id: "FOL",  espnStatId: 24, lowerIsBetter: true,  compute: (t, gp) => safe(t[24] ?? 0, Math.max(gp, 1)) },
  29: { id: "SOG",  espnStatId: 29, lowerIsBetter: false, compute: (t, gp) => safe(t[29] ?? 0, Math.max(gp, 1)) },
  30: { id: "GP",   espnStatId: 30, lowerIsBetter: false, compute: (t, gp) => safe(t[30] ?? 0, Math.max(gp, 1)) },
  32: { id: "HIT",  espnStatId: 32, lowerIsBetter: false, compute: (t, gp) => safe(t[32] ?? 0, Math.max(gp, 1)) },
  33: { id: "BLK",  espnStatId: 33, lowerIsBetter: false, compute: (t, gp) => safe(t[33] ?? 0, Math.max(gp, 1)) },

  // ── Skater — high-confidence hypothesis ─────────────────────────────────
  15: { id: "+/-",  espnStatId: 15, lowerIsBetter: false, compute: (t, gp) => safe(t[15] ?? 0, Math.max(gp, 1)) },
  17: { id: "PPP",  espnStatId: 17, lowerIsBetter: false, compute: (t, gp) => safe(t[17] ?? 0, Math.max(gp, 1)) },
  18: { id: "SHP",  espnStatId: 18, lowerIsBetter: false, compute: (t, gp) => safe(t[18] ?? 0, Math.max(gp, 1)) },
  25: { id: "TOI",  espnStatId: 25, lowerIsBetter: false, compute: (t, gp) => safe(t[25] ?? 0, Math.max(gp, 1)) },
  31: { id: "PIM",  espnStatId: 31, lowerIsBetter: false, compute: (t, gp) => safe(t[31] ?? 0, Math.max(gp, 1)) },

  // ── Skater — uncertain (best-guess labels, values correct numerically) ───
  19: { id: "GWG",  espnStatId: 19, lowerIsBetter: false, compute: (t, gp) => safe(t[19] ?? 0, Math.max(gp, 1)) },
  20: { id: "OTG",  espnStatId: 20, lowerIsBetter: false, compute: (t, gp) => safe(t[20] ?? 0, Math.max(gp, 1)) },
  21: { id: "SHG",  espnStatId: 21, lowerIsBetter: false, compute: (t, gp) => safe(t[21] ?? 0, Math.max(gp, 1)) },
  22: { id: "SHA",  espnStatId: 22, lowerIsBetter: false, compute: (t, gp) => safe(t[22] ?? 0, Math.max(gp, 1)) },
  26: { id: "TOIs", espnStatId: 26, lowerIsBetter: false, compute: (t, gp) => safe(t[26] ?? 0, Math.max(gp, 1)) },
  27: { id: "aTOI", espnStatId: 27, lowerIsBetter: false, compute: (t, gp) => safe(t[27] ?? 0, Math.max(gp, 1)) },
  28: { id: "UNK",  espnStatId: 28, lowerIsBetter: false, compute: (t, gp) => safe(t[28] ?? 0, Math.max(gp, 1)) },
  35: { id: "FW",   espnStatId: 35, lowerIsBetter: false, compute: (t, gp) => safe(t[35] ?? 0, Math.max(gp, 1)) },
  36: { id: "FL",   espnStatId: 36, lowerIsBetter: false, compute: (t, gp) => safe(t[36] ?? 0, Math.max(gp, 1)) },
  37: { id: "STK1", espnStatId: 37, lowerIsBetter: false, compute: (t, gp) => safe(t[37] ?? 0, Math.max(gp, 1)) },
  38: { id: "STK2", espnStatId: 38, lowerIsBetter: false, compute: (t, gp) => safe(t[38] ?? 0, Math.max(gp, 1)) },
  39: { id: "MISC", espnStatId: 39, lowerIsBetter: false, compute: (t, gp) => safe(t[39] ?? 0, Math.max(gp, 1)) },
};

/**
 * Default fallback scoring config for NHL leagues.
 * Classic 10-cat H2H: G, A, +/-, PPP, SOG, HIT, W, GAA, SV%, SO
 */
export const NHL_DEFAULT_SCORING_CONFIG: LeagueScoringConfig = {
  format: "categories",
  cats: [
    NHL_STAT_MAP[13],  // G
    NHL_STAT_MAP[14],  // A
    NHL_STAT_MAP[15],  // +/-
    NHL_STAT_MAP[17],  // PPP
    NHL_STAT_MAP[29],  // SOG
    NHL_STAT_MAP[32],  // HIT
    NHL_STAT_MAP[1],   // W
    NHL_STAT_MAP[10],  // GAA (lowerIsBetter)
    NHL_STAT_MAP[11],  // SV%
    NHL_STAT_MAP[7],   // SO
  ],
  pointValues: {},
};

// ─── MLB Baseball Stat Map ────────────────────────────────────────────────────
// Stat IDs discovered from live ESPN Fantasy Baseball API (league 128408842, season 2025).
// Source: cwendt94/espn-api baseball constants + isReverseItem flags from live scoringItems.
// Display order follows the actual scoringItems order from the user's H2H categories league.

export const MLB_DISPLAY_ORDER: number[] = [
  // Fielding / team wins / combo
  68, 69, 70, 71, 73, 74, 76, 72, 82, 83,
  // Pitching main
  53, 47, 55, 46, 56, 57, 59, 60, 62, 63, 54, 64, 67, 58,
  // Batting secondary
  4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 17, 18, 19,
  // Batting basics
  0, 1, 2, 3,
  // Pitching volume + rate
  36, 37, 41, 39, 38, 48, 45, 49, 44, 43, 42,
  // Batting advanced
  20, 21, 22, 23, 25, 24, 29, 32, 33, 27, 34, 26, 35,
];

export const MLB_STAT_MAP: Record<number, ScoringCat> = {
  // ── Batting counting stats ───────────────────────────────────────────────
  0:  { id: "AB",   espnStatId: 0,  lowerIsBetter: false, compute: (t, gp) => safe(t[0]  ?? 0, Math.max(gp, 1)) },
  1:  { id: "H",    espnStatId: 1,  lowerIsBetter: false, compute: (t, gp) => safe(t[1]  ?? 0, Math.max(gp, 1)) },
  3:  { id: "2B",   espnStatId: 3,  lowerIsBetter: false, compute: (t, gp) => safe(t[3]  ?? 0, Math.max(gp, 1)) },
  4:  { id: "3B",   espnStatId: 4,  lowerIsBetter: false, compute: (t, gp) => safe(t[4]  ?? 0, Math.max(gp, 1)) },
  5:  { id: "HR",   espnStatId: 5,  lowerIsBetter: false, compute: (t, gp) => safe(t[5]  ?? 0, Math.max(gp, 1)) },
  6:  { id: "XBH",  espnStatId: 6,  lowerIsBetter: false, compute: (t, gp) => safe(t[6]  ?? 0, Math.max(gp, 1)) },
  7:  { id: "1B",   espnStatId: 7,  lowerIsBetter: false, compute: (t, gp) => safe(t[7]  ?? 0, Math.max(gp, 1)) },
  8:  { id: "TB",   espnStatId: 8,  lowerIsBetter: false, compute: (t, gp) => safe(t[8]  ?? 0, Math.max(gp, 1)) },
  10: { id: "BB",   espnStatId: 10, lowerIsBetter: false, compute: (t, gp) => safe(t[10] ?? 0, Math.max(gp, 1)) },
  11: { id: "IBB",  espnStatId: 11, lowerIsBetter: false, compute: (t, gp) => safe(t[11] ?? 0, Math.max(gp, 1)) },
  12: { id: "HBP",  espnStatId: 12, lowerIsBetter: false, compute: (t, gp) => safe(t[12] ?? 0, Math.max(gp, 1)) },
  15: { id: "SAC",  espnStatId: 15, lowerIsBetter: false, compute: (t, gp) => safe(t[15] ?? 0, Math.max(gp, 1)) },
  19: { id: "RC",   espnStatId: 19, lowerIsBetter: false, compute: (t, gp) => safe(t[19] ?? 0, Math.max(gp, 1)) },
  20: { id: "R",    espnStatId: 20, lowerIsBetter: false, compute: (t, gp) => safe(t[20] ?? 0, Math.max(gp, 1)) },
  21: { id: "RBI",  espnStatId: 21, lowerIsBetter: false, compute: (t, gp) => safe(t[21] ?? 0, Math.max(gp, 1)) },
  22: { id: "PA",   espnStatId: 22, lowerIsBetter: false, compute: (t, gp) => safe(t[22] ?? 0, Math.max(gp, 1)) },
  23: { id: "SB",   espnStatId: 23, lowerIsBetter: false, compute: (t, gp) => safe(t[23] ?? 0, Math.max(gp, 1)) },
  24: { id: "CS",   espnStatId: 24, lowerIsBetter: true,  compute: (t, gp) => safe(t[24] ?? 0, Math.max(gp, 1)) },
  25: { id: "NSB",  espnStatId: 25, lowerIsBetter: false, compute: (t, gp) => safe(t[25] ?? 0, Math.max(gp, 1)) },
  26: { id: "GDP",  espnStatId: 26, lowerIsBetter: true,  compute: (t, gp) => safe(t[26] ?? 0, Math.max(gp, 1)) },
  27: { id: "SO",   espnStatId: 27, lowerIsBetter: true,  compute: (t, gp) => safe(t[27] ?? 0, Math.max(gp, 1)) },
  29: { id: "PPA",  espnStatId: 29, lowerIsBetter: false, compute: (t, gp) => safe(t[29] ?? 0, Math.max(gp, 1)) },
  32: { id: "GP",   espnStatId: 32, lowerIsBetter: false, compute: (t)      => t[32] ?? 0 }, // raw total
  33: { id: "GS",   espnStatId: 33, lowerIsBetter: false, compute: (t)      => t[33] ?? 0 }, // raw total
  // ── Batting rate stats (volume-weighted from component totals) ───────────
  2:  { id: "AVG",  espnStatId: 2,  lowerIsBetter: false, compute: (t) => safe(t[1] ?? 0, t[0] ?? 0) },                                           // H/AB
  9:  { id: "SLG",  espnStatId: 9,  lowerIsBetter: false, compute: (t) => safe(t[8] ?? 0, t[0] ?? 0) },                                           // TB/AB
  17: { id: "OBP",  espnStatId: 17, lowerIsBetter: false, compute: (t) => safe((t[1]??0)+(t[10]??0)+(t[12]??0), (t[0]??0)+(t[10]??0)+(t[12]??0)) }, // (H+BB+HBP)/(AB+BB+HBP)
  18: { id: "OPS",  espnStatId: 18, lowerIsBetter: false, compute: (t) => safe(t[8]??0, t[0]??0) + safe((t[1]??0)+(t[10]??0)+(t[12]??0), (t[0]??0)+(t[10]??0)+(t[12]??0)) }, // SLG+OBP
  // ── Pitching counting stats ──────────────────────────────────────────────
  34: { id: "OUTS", espnStatId: 34, lowerIsBetter: false, compute: (t, gp) => safe(t[34] ?? 0, Math.max(gp, 1)) },
  35: { id: "TBF",  espnStatId: 35, lowerIsBetter: false, compute: (t, gp) => safe(t[35] ?? 0, Math.max(gp, 1)) },
  36: { id: "IP",   espnStatId: 36, lowerIsBetter: false, compute: (t)      => safe(t[34] ?? 0, 3) },  // OUTS/3
  37: { id: "HA",   espnStatId: 37, lowerIsBetter: true,  compute: (t, gp) => safe(t[37] ?? 0, Math.max(gp, 1)) },
  39: { id: "BB",   espnStatId: 39, lowerIsBetter: true,  compute: (t, gp) => safe(t[39] ?? 0, Math.max(gp, 1)) }, // pitcher BB
  42: { id: "HBP",  espnStatId: 42, lowerIsBetter: true,  compute: (t, gp) => safe(t[42] ?? 0, Math.max(gp, 1)) }, // pitcher HBP
  44: { id: "RA",   espnStatId: 44, lowerIsBetter: true,  compute: (t, gp) => safe(t[44] ?? 0, Math.max(gp, 1)) },
  45: { id: "ER",   espnStatId: 45, lowerIsBetter: true,  compute: (t, gp) => safe(t[45] ?? 0, Math.max(gp, 1)) },
  46: { id: "HRA",  espnStatId: 46, lowerIsBetter: true,  compute: (t, gp) => safe(t[46] ?? 0, Math.max(gp, 1)) },
  48: { id: "K",    espnStatId: 48, lowerIsBetter: false, compute: (t, gp) => safe(t[48] ?? 0, Math.max(gp, 1)) }, // pitcher K
  53: { id: "W",    espnStatId: 53, lowerIsBetter: false, compute: (t)      => t[53] ?? 0 }, // raw total
  54: { id: "L",    espnStatId: 54, lowerIsBetter: true,  compute: (t)      => t[54] ?? 0 }, // raw total
  56: { id: "SVO",  espnStatId: 56, lowerIsBetter: false, compute: (t)      => t[56] ?? 0 },
  57: { id: "SV",   espnStatId: 57, lowerIsBetter: false, compute: (t)      => t[57] ?? 0 },
  58: { id: "BS",   espnStatId: 58, lowerIsBetter: true,  compute: (t)      => t[58] ?? 0 },
  60: { id: "HLD",  espnStatId: 60, lowerIsBetter: false, compute: (t)      => t[60] ?? 0 },
  62: { id: "CG",   espnStatId: 62, lowerIsBetter: false, compute: (t)      => t[62] ?? 0 },
  63: { id: "QS",   espnStatId: 63, lowerIsBetter: false, compute: (t)      => t[63] ?? 0 },
  64: { id: "SHO",  espnStatId: 64, lowerIsBetter: false, compute: (t)      => t[64] ?? 0 },
  67: { id: "SVHD", espnStatId: 67, lowerIsBetter: false, compute: (t)      => (t[57] ?? 0) + (t[60] ?? 0) }, // SV+HLD
  // ── Pitching rate stats (computed from components) ───────────────────────
  38: { id: "OBA",  espnStatId: 38, lowerIsBetter: true,  compute: (t) => (t[34] ?? 0) > 0 ? safe(t[37] ?? 0, (t[34] ?? 0) / 3 * 3 + (t[37] ?? 0)) : 0 },
  41: { id: "WHIP", espnStatId: 41, lowerIsBetter: true,  compute: (t) => (t[34] ?? 0) > 0 ? ((t[37] ?? 0) + (t[39] ?? 0)) * 3 / (t[34] ?? 1) : 0 }, // (HA+BB)/IP
  43: { id: "OOBP", espnStatId: 43, lowerIsBetter: true,  compute: (t) => (t[34] ?? 0) > 0 ? ((t[37] ?? 0) + (t[39] ?? 0) + (t[42] ?? 0)) * 3 / (t[34] ?? 1) : 0 },
  47: { id: "ERA",  espnStatId: 47, lowerIsBetter: true,  compute: (t) => (t[34] ?? 0) > 0 ? (t[45] ?? 0) * 27 / (t[34] ?? 1) : 0 },                     // ER*9/IP
  49: { id: "K/9",  espnStatId: 49, lowerIsBetter: false, compute: (t) => (t[34] ?? 0) > 0 ? (t[48] ?? 0) * 27 / (t[34] ?? 1) : 0 },                     // K*9/IP
  55: { id: "WPCT", espnStatId: 55, lowerIsBetter: false, compute: (t) => safe(t[53] ?? 0, (t[53] ?? 0) + (t[54] ?? 0)) },                                // W/(W+L)
  59: { id: "SV%",  espnStatId: 59, lowerIsBetter: false, compute: (t) => safe(t[57] ?? 0, t[56] ?? 0) },                                                  // SV/SVO
  82: { id: "K/BB", espnStatId: 82, lowerIsBetter: false, compute: (t) => safe(t[48] ?? 0, t[39] ?? 0) },                                                  // K/BB (pitcher)
  // ── Fielding stats ────────────────────────────────────────────────────────
  68: { id: "PO",   espnStatId: 68, lowerIsBetter: false, compute: (t, gp) => safe(t[68] ?? 0, Math.max(gp, 1)) },
  69: { id: "A",    espnStatId: 69, lowerIsBetter: false, compute: (t, gp) => safe(t[69] ?? 0, Math.max(gp, 1)) },
  70: { id: "OFA",  espnStatId: 70, lowerIsBetter: false, compute: (t, gp) => safe(t[70] ?? 0, Math.max(gp, 1)) },
  71: { id: "FPCT", espnStatId: 71, lowerIsBetter: false, compute: (t) => safe((t[68]??0)+(t[69]??0), (t[68]??0)+(t[69]??0)+(t[72]??0)) }, // (PO+A)/(PO+A+E)
  72: { id: "E",    espnStatId: 72, lowerIsBetter: true,  compute: (t, gp) => safe(t[72] ?? 0, Math.max(gp, 1)) },
  73: { id: "DP",   espnStatId: 73, lowerIsBetter: false, compute: (t, gp) => safe(t[73] ?? 0, Math.max(gp, 1)) },
  74: { id: "TW",   espnStatId: 74, lowerIsBetter: false, compute: (t)      => t[74] ?? 0 }, // Team Wins (batting)
  76: { id: "PTW",  espnStatId: 76, lowerIsBetter: false, compute: (t)      => t[76] ?? 0 }, // Team Wins (pitching)
  83: { id: "SVHD", espnStatId: 83, lowerIsBetter: false, compute: (t)      => t[83] ?? 0 }, // Saves+Holds (alternate ID)
};

/**
 * Default fallback scoring config for MLB leagues.
 * Standard 5x5 H2H: R, HR, RBI, SB, AVG + W, SV, K, ERA, WHIP
 */
export const MLB_DEFAULT_SCORING_CONFIG: LeagueScoringConfig = {
  format: "categories",
  cats: [
    MLB_STAT_MAP[20],  // R
    MLB_STAT_MAP[5],   // HR
    MLB_STAT_MAP[21],  // RBI
    MLB_STAT_MAP[23],  // SB
    MLB_STAT_MAP[2],   // AVG
    MLB_STAT_MAP[17],  // OBP
    MLB_STAT_MAP[53],  // W
    MLB_STAT_MAP[57],  // SV
    MLB_STAT_MAP[48],  // K
    MLB_STAT_MAP[47],  // ERA
    MLB_STAT_MAP[41],  // WHIP
    MLB_STAT_MAP[63],  // QS
  ],
  pointValues: {},
};

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
 * Falls back to DEFAULT_SCORING_CONFIG (or cfg.defaultScoringConfig) on any parse failure.
 *
 * Confirmed ESPN field names (season 2026):
 *   settings.scoringSettings.scoringType  — e.g. "H2H_MOST_CATEGORIES", "H2H_POINTS", "ROTO"
 *   settings.scoringSettings.scoringItems — array of { statId, isReverseItem, points, ... }
 *
 * IMPORTANT: In H2H categories leagues every scoringItem carries "points": 1 — NOT a points
 * league signal. Format is determined by scoringType only.
 *
 * @param cfg  Optional sport config — provides the stat map and display order for the sport.
 *             Falls back to basketball defaults when omitted (NBA / WNBA).
 */
export function parseLeagueScoringConfig(
  settings: unknown,
  cfg?: { statMap?: Record<number, ScoringCat>; statDisplayOrder?: number[]; defaultScoringConfig?: LeagueScoringConfig },
): LeagueScoringConfig {
  const statMap       = cfg?.statMap       ?? ESPN_STAT_MAP;
  const displayOrder  = cfg?.statDisplayOrder ?? ESPN_DISPLAY_ORDER;
  const fallbackConfig = cfg?.defaultScoringConfig ?? DEFAULT_SCORING_CONFIG;

  const localRank = (id: number) => {
    const idx = displayOrder.indexOf(id);
    return idx === -1 ? 999 : idx;
  };

  if (!settings || typeof settings !== "object") return fallbackConfig;
  const s = settings as Record<string, unknown>;

  const scoringSettings = s.scoringSettings as Record<string, unknown> | undefined;
  if (!scoringSettings) return fallbackConfig;

  const scoringItems = scoringSettings.scoringItems as unknown[] | undefined;
  if (!Array.isArray(scoringItems) || scoringItems.length === 0) return fallbackConfig;

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
      const cat = statMap[statId];
      if (cat) cats.push(cat);
    }
    if (cats.length === 0) return fallbackConfig;
    cats.sort((a, b) => localRank(a.espnStatId) - localRank(b.espnStatId));
    return { format: "points", cats, pointValues };
  }

  // Categories or Roto
  const cats: ScoringCat[] = [];
  for (const item of scoringItems) {
    const it = item as Record<string, unknown>;
    const statId = typeof it.statId === "number" ? it.statId : parseInt(String(it.statId), 10);
    if (isNaN(statId)) continue;

    const cat = statMap[statId];
    if (!cat) {
      // Unknown stat ID — open browser DevTools console to identify missing categories.
      console.warn(`[fantasy-tool] Unknown ESPN stat ID ${statId} — category skipped.`);
      continue;
    }

    // isReverseItem = true means lower is better (e.g. TO, GA, L).
    // Only override when it differs from the map default.
    const reverse = it.isReverseItem === true;
    cats.push(reverse !== cat.lowerIsBetter ? { ...cat, lowerIsBetter: reverse } : cat);
  }

  if (cats.length < 2) return fallbackConfig;

  cats.sort((a, b) => localRank(a.espnStatId) - localRank(b.espnStatId));
  return { format: isRoto ? "roto" : "categories", cats };
}
