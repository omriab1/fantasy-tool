import { CATEGORIES, LOWER_IS_BETTER } from "./types";
import type { AggregatedStats, CategoryResult, TradeAnalysis } from "./types";

export function calcTradeScore(giving: AggregatedStats, receiving: AggregatedStats): TradeAnalysis {
  const results: CategoryResult[] = CATEGORIES.map((cat) => {
    const g = giving[cat];
    const r = receiving[cat];

    // Round each side to display precision first, then compute delta.
    // This ensures values that look equal (e.g. 2.44 vs 2.36 → both "2.4") are treated as equal.
    const isPct = cat === "AFG%" || cat === "FT%";
    const factor = isPct ? 10000 : 10;
    const rg = Math.round(g * factor) / factor;
    const rr = Math.round(r * factor) / factor;
    const delta = Math.round((rr - rg) * factor) / factor;

    let winner: CategoryResult["winner"];
    const lowerIsBetter = LOWER_IS_BETTER.includes(cat as typeof LOWER_IS_BETTER[number]);

    if (delta === 0) {
      winner = "push";
    } else if (lowerIsBetter) {
      // For TO, receiving fewer is better → delta < 0 means receiving wins
      winner = delta < 0 ? "receiving" : "giving";
    } else {
      winner = delta > 0 ? "receiving" : "giving";
    }

    return { category: cat, giving: g, receiving: r, delta, winner };
  });

  const winsForReceiving = results.filter((r) => r.winner === "receiving").length;
  const losses = results.filter((r) => r.winner === "giving").length;
  const equals = results.filter((r) => r.winner === "push").length;

  return { results, winsForReceiving, losses, equals, totalCats: CATEGORIES.length };
}
