/**
 * Core math for the Matchup Planner.
 *
 * Projection logic: per_game_avg × games_this_week for each player.
 *   per_game_avg = rawStats[statId] / gp  (rawStats are window TOTALS, gp = games in that window)
 *   projected_total = per_game_avg × games_in_scope
 *
 * Percentage stats (FG%, FT%, 3P%): accumulate made × games / att × games across all players
 *   before dividing — identical volume-weighting to aggregateStats() in stat-calculator.ts.
 */

import type { PlayerStats, AggregatedStats, LeagueScoringConfig } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Per-player game counts keyed by playerId. */
export type GamesPerPlayer = Record<number, number>;

/** Full matchup data returned from /api/espn/matchup or /api/yahoo/matchup. */
export interface MatchupApiResponse {
  myTeamId: number;
  myTeamName: string;
  opponentTeamId: number | null;        // null = bye week
  opponentTeamName: string | null;
  matchupPeriodId: number;
  /** The actual current matchup period — stays constant regardless of which period is being viewed. */
  currentMatchupPeriodId: number;
  /** Total number of matchup periods in the season (for the period selector). */
  totalMatchupPeriods: number;
  /** proTeamId (as string) → total games this matchup week */
  gamesInWeek: Record<string, number>;
  /** proTeamId (as string) → remaining games this matchup week (future dates only) */
  gamesRemaining: Record<string, number>;
  /** Calendar days remaining in the matchup period (including today if not yet over) */
  daysRemaining: number;
  /** statId (as string) → cumulative score for my team this week so far */
  myCurrentStats: Record<string, number>;
  /** statId (as string) → cumulative score for opponent this week so far */
  oppCurrentStats: Record<string, number>;
  /**
   * teamId → { statId (as string) → cumulative score } for every team in the league.
   * Allows Projected Score mode to show actual + remaining stats for any selected team pair.
   */
  teamCurrentStats: Record<number, Record<string, number>>;
  /**
   * Fresh roster (non-IR player IDs) for every team in the league, taken directly
   * from the API response (bypasses the 15-min localStorage cache in useLeague).
   * Used on the Matchup page so recent drops/adds are reflected immediately.
   */
  rosterByTeamId: Record<number, number[]>;
}

// ─── Game counting helpers ────────────────────────────────────────────────────

/**
 * Build a gamesPerPlayer map from the matchup API response.
 *
 * For ESPN: player.teamAbbrev = proTeamId (numeric string, e.g. "13" for LAL).
 * For Yahoo: player.teamAbbrev = NBA abbrev (e.g. "LAL"), which must be
 * pre-mapped to ESPN proTeamId before calling this function.
 *
 * @param players  Active roster players (IR already excluded)
 * @param gameMap  proTeamId string → game count for the scope
 */
export function buildGamesPerPlayer(
  players: PlayerStats[],
  gameMap: Record<string, number>,
): GamesPerPlayer {
  const result: GamesPerPlayer = {};
  for (const p of players) {
    result[p.playerId] = gameMap[p.teamAbbrev] ?? 0;
  }
  return result;
}

// ─── Projection math ──────────────────────────────────────────────────────────

/**
 * Build a raw stat accumulator: multiply each player's stat totals by (games / gp).
 * Result keys are ESPN stat IDs (numbers).
 *
 * For counting stats: accum[statId] = Σ(rawStats[statId] * games / gp) across players
 * For percentage stats: accum[madeId] and accum[attId] are accumulated separately,
 *   so cat.compute(accum, 1) correctly computes the volume-weighted percentage.
 */
export function buildProjectionAccum(
  players: PlayerStats[],
  gamesPerPlayer: GamesPerPlayer,
): Record<number, number> {
  const accum: Record<number, number> = {};
  for (const p of players) {
    const games = gamesPerPlayer[p.playerId] ?? 0;
    if (games === 0) continue;
    const gp = Math.max(p.gp, 1);
    const mult = games / gp;
    for (const [sidStr, val] of Object.entries(p.rawStats ?? {})) {
      const sid = parseInt(sidStr, 10);
      if (isNaN(sid)) continue;
      // Skip GP stat IDs — projected games are tracked separately
      if (sid === 42 || sid === 30) continue;
      accum[sid] = (accum[sid] ?? 0) + val * mult;
    }
  }
  return accum;
}

/**
 * Merge the actual-so-far stats (scoreByStat) with the projected-remaining accumulator.
 * Used for Projected Score mode.
 *
 * actualScoreByStat: { "0": 125.6, "13": 42.0, "14": 88.0, ... }
 *   — statId as string key, total accumulated score for the week so far
 * remainingAccum: { 0: 64.3, 13: 22.1, 14: 46.0, ... }
 *   — statId as number key, projected totals for remaining games
 */
export function buildCombinedAccum(
  actualScoreByStat: Record<string, number>,
  remainingAccum: Record<number, number>,
): Record<number, number> {
  const combined: Record<number, number> = { ...remainingAccum };
  for (const [sidStr, score] of Object.entries(actualScoreByStat)) {
    const sid = parseInt(sidStr, 10);
    if (!isNaN(sid)) {
      combined[sid] = (combined[sid] ?? 0) + score;
    }
  }
  return combined;
}

/**
 * Convert a raw stat accumulator to AggregatedStats using the scoring config.
 * Pass gp=1 because the accumulator already contains projected/total values (not per-game).
 *
 * Also sets _m and _a keys for volume display (e.g. FG% made/attempted).
 */
export function accumToStats(
  accum: Record<number, number>,
  config: LeagueScoringConfig,
): AggregatedStats {
  if (config.format === "points") {
    const pointValues = config.pointValues ?? {};
    let fpts = 0;
    for (const [sidStr, ptVal] of Object.entries(pointValues)) {
      const sid = parseInt(sidStr, 10);
      fpts += (accum[sid] ?? 0) * ptVal;
    }
    return { FPts: fpts };
  }

  const result: AggregatedStats = {};
  for (const cat of config.cats) {
    result[cat.id] = cat.compute(accum, 1);
    if (cat.volumeStatIds) {
      // Round to 1dp for display consistency (mirrors aggregateStats volume display)
      result[cat.id + "_m"] = Math.round((accum[cat.volumeStatIds[0]] ?? 0) * 10) / 10;
      result[cat.id + "_a"] = Math.round((accum[cat.volumeStatIds[1]] ?? 0) * 10) / 10;
    }
  }
  return result;
}
