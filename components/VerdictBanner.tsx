interface TradeVerdictProps {
  type: "trade";
  wins: number;
  losses: number;
  equals: number;
  total: number;
}

interface MatchupVerdictProps {
  type: "matchup";
  teamAName: string;
  teamBName: string;
  teamAWins: number;
  teamBWins: number;
}

type Props = TradeVerdictProps | MatchupVerdictProps;

export function VerdictBanner(props: Props) {
  if (props.type === "trade") {
    const { wins, losses, equals } = props;
    const color =
      wins > losses ? "text-green-400" : wins < losses ? "text-red-400" : "text-yellow-400";
    return (
      <div className="bg-[#1a1f2e] border border-white/10 rounded-xl p-5 text-center">
        <p className="text-gray-400 text-sm mb-1 uppercase tracking-widest">Trade verdict</p>
        <p className={`text-3xl font-bold font-mono ${color}`}>
          {wins}W — {losses}L{equals > 0 ? ` — ${equals}E` : ""}
        </p>
        <p className="text-gray-500 text-sm mt-1">
          {wins > losses
            ? "This trade favors you."
            : wins < losses
            ? "This trade hurts you."
            : "This trade is a wash."}
        </p>
      </div>
    );
  }

  const { teamAName, teamBName, teamAWins, teamBWins } = props;
  const color =
    teamAWins > teamBWins
      ? "text-green-400"
      : teamAWins < teamBWins
      ? "text-red-400"
      : "text-yellow-400";

  return (
    <div className="bg-[#1a1f2e] border border-white/10 rounded-xl p-5 text-center">
      <p className="text-gray-400 text-sm mb-1 uppercase tracking-widest">Matchup score</p>
      <p className={`text-3xl font-bold font-mono ${color}`}>
        {teamAName}{" "}
        <span className="text-white">
          {teamAWins} — {teamBWins}
        </span>{" "}
        {teamBName}
      </p>
    </div>
  );
}
