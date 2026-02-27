import type { AggregatedStats, CategoryResult, TradeAnalysis, LeagueScoringConfig } from "./types";

export function calcTradeScore(
  giving: AggregatedStats,
  receiving: AggregatedStats,
  config: LeagueScoringConfig,
): TradeAnalysis {
  // Points leagues: a single "FPts" row compares total fantasy points
  if (config.format === "points") {
    const g = Math.round((giving["FPts"] ?? 0) * 10) / 10;
    const r = Math.round((receiving["FPts"] ?? 0) * 10) / 10;
    const delta = Math.round((r - g) * 10) / 10;
    const winner: CategoryResult["winner"] =
      delta > 0 ? "receiving" : delta < 0 ? "giving" : "push";
    return {
      results: [{ category: "FPts", giving: g, receiving: r, delta, winner, lowerIsBetter: false }],
      winsForReceiving: winner === "receiving" ? 1 : 0,
      losses:           winner === "giving"    ? 1 : 0,
      equals:           winner === "push"      ? 1 : 0,
      totalCats: 1,
    };
  }

  const results: CategoryResult[] = config.cats.map((cat) => {
    const g = giving[cat.id] ?? 0;
    const r = receiving[cat.id] ?? 0;

    // Round each side to display precision first, then compute delta.
    // This ensures values that look equal (e.g. 2.44 vs 2.36 → both "2.4") are treated as equal.
    const isPct = cat.id.endsWith("%");
    const factor = isPct ? 10000 : 10;
    const rg = Math.round(g * factor) / factor;
    const rr = Math.round(r * factor) / factor;
    const delta = Math.round((rr - rg) * factor) / factor;

    let winner: CategoryResult["winner"];

    if (delta === 0) {
      if (isPct) {
        // Raw-value tiebreaker: display rounds to same value but actual values may differ
        const rawDiff = r - g;
        if (rawDiff === 0) {
          winner = "push";
        } else if (cat.lowerIsBetter) {
          winner = rawDiff < 0 ? "receiving" : "giving";
        } else {
          winner = rawDiff > 0 ? "receiving" : "giving";
        }
      } else {
        winner = "push";
      }
    } else if (cat.lowerIsBetter) {
      winner = delta < 0 ? "receiving" : "giving";
    } else {
      winner = delta > 0 ? "receiving" : "giving";
    }

    const givingVol = cat.volumeStatIds
      ? [giving[cat.id + "_m"] ?? 0, giving[cat.id + "_a"] ?? 0] as const
      : undefined;
    const receivingVol = cat.volumeStatIds
      ? [receiving[cat.id + "_m"] ?? 0, receiving[cat.id + "_a"] ?? 0] as const
      : undefined;

    // Return rounded values so table display is consistent with delta/winner
    return { category: cat.id, giving: rg, receiving: rr, delta, winner, lowerIsBetter: cat.lowerIsBetter, givingVol, receivingVol };
  });

  const winsForReceiving = results.filter((r) => r.winner === "receiving").length;
  const losses           = results.filter((r) => r.winner === "giving").length;
  const equals           = results.filter((r) => r.winner === "push").length;

  return { results, winsForReceiving, losses, equals, totalCats: config.cats.length };
}
