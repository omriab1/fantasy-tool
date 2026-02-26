import { LOWER_IS_BETTER } from "@/lib/types";
import type { CategoryResult } from "@/lib/types";
import { fmt } from "@/lib/stat-calculator";

interface TradeTableProps {
  mode: "trade";
  results: CategoryResult[];
}

interface MatchupTableProps {
  mode: "matchup";
  results: CategoryResult[];
  teamAName: string;
  teamBName: string;
}

type Props = TradeTableProps | MatchupTableProps;

export function CategoryTable(props: Props) {
  const { results } = props;

  if (props.mode === "trade") {
    return (
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-500 text-xs uppercase border-b border-white/10">
            <th className="text-left py-2 px-3 font-medium">Cat</th>
            <th className="text-right py-2 px-3 font-medium">Giving</th>
            <th className="text-right py-2 px-3 font-medium">Receiving</th>
            <th className="text-right py-2 px-3 font-medium">Δ</th>
            <th className="text-right py-2 px-3 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => {
            const isWin = r.winner === "receiving";
            const isLoss = r.winner === "giving";
            const rowColor = isWin
              ? "bg-green-500/10 border-l-2 border-l-green-500"
              : isLoss
              ? "bg-red-500/10 border-l-2 border-l-red-500"
              : "";
            const lowerBetter = LOWER_IS_BETTER.includes(r.category as typeof LOWER_IS_BETTER[number]);
            const deltaColor = isWin ? "text-green-400" : isLoss ? "text-red-400" : "text-gray-500";
            const deltaSign = r.delta > 0 ? "+" : "";

            return (
              <tr key={r.category} className={`border-b border-white/5 ${rowColor}`}>
                <td className="py-2 px-3 font-medium text-white">
                  {r.category}
                  {lowerBetter && <span className="text-gray-600 text-xs ml-1">↓</span>}
                </td>
                <td className={`py-2 px-3 text-right font-mono ${isLoss ? "text-white font-bold" : "text-gray-400"}`}>
                  {fmt(r.giving, r.category)}
                </td>
                <td className={`py-2 px-3 text-right font-mono ${isWin ? "text-white font-bold" : "text-gray-400"}`}>
                  {fmt(r.receiving, r.category)}
                </td>
                <td className={`py-2 px-3 text-right font-mono font-semibold whitespace-nowrap ${deltaColor}`}>
                  {r.winner !== "push" && fmt(r.giving, r.category) === fmt(r.receiving, r.category)
                    ? (isWin ? "> +.001" : "< -.001")
                    : `${deltaSign}${fmt(r.delta, r.category)}`}
                </td>
                <td className="py-2 px-3 text-right">
                  {isWin ? (
                    <span className="text-green-400 font-bold">W</span>
                  ) : isLoss ? (
                    <span className="text-red-400 font-bold">L</span>
                  ) : (
                    <span className="text-gray-500">T</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  // Matchup mode
  const { teamAName, teamBName } = props as MatchupTableProps;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-500 text-xs uppercase border-b border-white/10">
            <th className="text-right py-2 px-3 font-medium">{teamAName}</th>
            <th className="text-center py-2 px-3 font-medium">Category</th>
            <th className="text-left py-2 px-3 font-medium">{teamBName}</th>
            <th className="text-right py-2 px-3 font-medium">Delta (A−B)</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => {
            // In matchup mode: giving = Team A, receiving = Team B
            const teamAWins = r.winner === "giving";
            const teamBWins = r.winner === "receiving";
            const rowColor = teamAWins
              ? "bg-green-500/10 border-l-2 border-l-green-500"
              : teamBWins
              ? "bg-red-500/10 border-l-2 border-l-red-500"
              : "";
            const lowerBetter = LOWER_IS_BETTER.includes(r.category as typeof LOWER_IS_BETTER[number]);
            const deltaColor = teamAWins
              ? "text-green-400"
              : teamBWins
              ? "text-red-400"
              : "text-gray-500";

            // Delta = giving - receiving (Team A - Team B). r.delta is receiving-giving so negate it.
            const delta = -r.delta;
            const deltaSign = delta > 0 ? "+" : "";

            return (
              <tr key={r.category} className={`border-b border-white/5 ${rowColor}`}>
                <td className={`py-2.5 px-3 text-right font-mono ${teamAWins ? "text-white font-semibold" : "text-gray-400"}`}>
                  {fmt(r.giving, r.category)}
                </td>
                <td className="py-2.5 px-3 text-center font-medium text-white">
                  {r.category}
                  {lowerBetter && <span className="text-gray-600 text-xs ml-1">↓</span>}
                </td>
                <td className={`py-2.5 px-3 text-left font-mono ${teamBWins ? "text-white font-semibold" : "text-gray-400"}`}>
                  {fmt(r.receiving, r.category)}
                </td>
                <td className={`py-2.5 px-3 text-right font-mono font-semibold whitespace-nowrap ${deltaColor}`}>
                  {r.winner !== "push" && fmt(r.giving, r.category) === fmt(r.receiving, r.category)
                    ? (teamAWins ? "> +.001" : "< -.001")
                    : `${deltaSign}${fmt(delta, r.category)}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
