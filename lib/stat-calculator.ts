import type { PlayerStats, AggregatedStats } from "./types";

export function aggregateStats(players: PlayerStats[]): AggregatedStats {
  if (players.length === 0) {
    return { PTS: 0, REB: 0, AST: 0, STL: 0, BLK: 0, TO: 0, "3PM": 0, "eFG%": 0, "FT%": 0 };
  }

  // Counting stats: SUM of per-game averages across all players
  // (e.g. giving away 2 players → their combined per-game contribution)
  let sumPTS = 0, sumREB = 0, sumAST = 0, sumSTL = 0, sumBLK = 0, sumTO = 0, sum3PM = 0;

  // Percentage stats: volume-weighted using raw totals
  // eFG% = (Σ FGM + 0.5 × Σ 3PM) / Σ FGA
  // FT%  = Σ FTM / Σ FTA
  let totalFGM = 0, totalFGA = 0, total3PM = 0, totalFTM = 0, totalFTA = 0;

  for (const p of players) {
    const gp = Math.max(p.gp, 1);

    sumPTS  += p.pts  / gp;
    sumREB  += p.reb  / gp;
    sumAST  += p.ast  / gp;
    sumSTL  += p.stl  / gp;
    sumBLK  += p.blk  / gp;
    sumTO   += p.to   / gp;
    sum3PM  += p.threepm / gp;

    totalFGM  += p.fgm;
    totalFGA  += p.fga;
    total3PM  += p.threepm;
    totalFTM  += p.ftm;
    totalFTA  += p.fta;
  }

  const safe = (n: number, d: number) => (d === 0 ? 0 : n / d);

  return {
    PTS: sumPTS,
    REB: sumREB,
    AST: sumAST,
    STL: sumSTL,
    BLK: sumBLK,
    TO: sumTO,
    "3PM": sum3PM,
    "eFG%": safe(totalFGM + 0.5 * total3PM, totalFGA),
    "FT%": safe(totalFTM, totalFTA),
  };
}

export function fmt(val: number, cat: string): string {
  if (cat === "eFG%" || cat === "FT%") {
    // Show as .xxx (e.g. .465) — val is 0–1 range
    const sign = val < 0 ? "-" : "";
    const abs = Math.abs(val).toFixed(3); // "0.465"
    return sign + abs.slice(1);           // ".465"
  }
  return val.toFixed(1);
}
