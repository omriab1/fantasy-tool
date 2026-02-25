import { CATEGORIES, LOWER_IS_BETTER } from "./types";
import type { AggregatedStats, CategoryResult, TradeAnalysis } from "./types";

export function calcTradeScore(giving: AggregatedStats, receiving: AggregatedStats): TradeAnalysis {
  const results: CategoryResult[] = CATEGORIES.map((cat) => {
    const g = giving[cat];
    const r = receiving[cat];
    const delta = r - g;

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

  return { results, winsForReceiving, totalCats: CATEGORIES.length };
}
