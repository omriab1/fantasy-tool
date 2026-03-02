import type { PlayerStats, AggregatedStats, LeagueScoringConfig } from "./types";

/**
 * Aggregate per-game contributions from a list of players.
 *
 * For counting stats (PTS, REB, …): SUM of per-game averages across players
 *   e.g. Player A (30 PTS/g) + Player B (20 PTS/g) = 50 PTS/g combined
 * For percentage stats (FG%, FT%, AFG%): volume-weighted using per-game component sums
 *   e.g. FT% = Σ(FTM/GP) / Σ(FTA/GP)  — correct combined shooting rate
 * For points leagues: returns { FPts: Σ(stat × pointValue) / Σ GP }
 */
export function aggregateStats(players: PlayerStats[], config: LeagueScoringConfig): AggregatedStats {
  if (players.length === 0) {
    if (config.format === "points") return { FPts: 0 };
    const empty: AggregatedStats = {};
    for (const cat of config.cats) empty[cat.id] = 0;
    return empty;
  }

  if (config.format === "points") {
    const pointValues = config.pointValues ?? {};
    let totalFPts = 0;
    for (const p of players) {
      const gp = Math.max(p.gp, 1);
      let fpts = 0;
      for (const [sidStr, ptVal] of Object.entries(pointValues)) {
        const sid = parseInt(sidStr, 10);
        fpts += (p.rawStats[sid] ?? 0) * ptVal;
      }
      totalFPts += fpts / gp; // per-game contribution per player
    }
    return { FPts: totalFPts };
  }

  // Categories / Roto: accumulate per-game contributions for each player.
  // Dividing each player's raw total by their own GP normalises to per-game before summing,
  // so the result is the COMBINED per-game contribution of the whole group
  // (e.g. 30 PTS/game + 20 PTS/game = 50 PTS/game for a 2-player bucket).
  // Percentage stats (FT%, AFG%) use the ratio of the accumulated component sums,
  // giving a volume-weighted percentage that mirrors the per-game approach.
  const perGame: Record<number, number> = {};
  // perGameRounded: same as perGame but each player's contribution is rounded to 1dp before
  // summing. Used only for volume display (e.g. "2.1/2.8") so that the shown made/attempted
  // numbers match what you'd get by adding each player's displayed stat line by eye.
  const perGameRounded: Record<number, number> = {};

  for (const p of players) {
    const gp = Math.max(p.gp, 1);
    for (const [sidStr, val] of Object.entries(p.rawStats ?? {})) {
      const sid = parseInt(sidStr, 10);
      if (isNaN(sid)) continue;
      // GP stats: rawStats[gpId] = p.gp, so dividing by gp would always give 1.
      // Accumulate as raw total so compute(perGame, 1) returns the actual sum of games played.
      // Basketball GP = stat 42; Hockey GP = stat 30.
      if (sid === 42 || sid === 30) {
        perGame[sid] = (perGame[sid] ?? 0) + (val as number);
      } else {
        const pgVal = (val as number) / gp;
        perGame[sid] = (perGame[sid] ?? 0) + pgVal;
        perGameRounded[sid] = (perGameRounded[sid] ?? 0) + Math.round(pgVal * 10) / 10;
      }
    }
  }

  // Pass gp=1 because perGame values are already per-game sums, not raw totals.
  const result: AggregatedStats = {};
  for (const cat of config.cats) {
    result[cat.id] = cat.compute(perGame, 1);
    if (cat.volumeStatIds) {
      // Use rounded per-player contributions for volume display so e.g. 1.5 + 0.6 = 2.1 (not 2.2)
      result[cat.id + "_m"] = perGameRounded[cat.volumeStatIds[0]] ?? 0;
      result[cat.id + "_a"] = perGameRounded[cat.volumeStatIds[1]] ?? 0;
    }
  }
  return result;
}

/**
 * Format a category value for display.
 * Percentage categories (any cat ending in "%") use .xxx notation; others use one decimal.
 */
export function fmt(val: number, cat: string): string {
  if (cat.endsWith("%")) {
    // Show as .xxx (e.g. .465) — val is 0–1 range
    const sign = val < 0 ? "-" : "";
    const abs = Math.abs(val).toFixed(3); // "0.465"
    return sign + abs.slice(1);           // ".465"
  }
  return val.toFixed(1);
}
