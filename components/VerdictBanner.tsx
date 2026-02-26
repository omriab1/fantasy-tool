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
  teamALogo?: string;
  teamBLogo?: string;
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
          {wins}W — {losses}L{equals > 0 ? ` — ${equals}T` : ""}
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

  const { teamAName, teamBName, teamAWins, teamBWins, teamALogo, teamBLogo } = props;
  const color =
    teamAWins > teamBWins
      ? "text-green-400"
      : teamAWins < teamBWins
      ? "text-red-400"
      : "text-yellow-400";

  return (
    <div className="bg-[#1a1f2e] border border-white/10 rounded-xl p-5 text-center">
      <p className="text-gray-400 text-sm mb-3 uppercase tracking-widest">Matchup score</p>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2 min-w-0">
            {teamALogo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={teamALogo} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" onError={(e) => { e.currentTarget.style.display = "none"; }} />
            )}
            <span className={`font-bold text-lg truncate ${teamAWins > teamBWins ? "text-green-400" : "text-gray-400"}`}>
              {teamAName}
            </span>
          </div>
          <span className={`font-mono text-3xl font-bold shrink-0 ml-4 ${teamAWins > teamBWins ? "text-green-400" : "text-gray-300"}`}>
            {teamAWins}
          </span>
        </div>
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2 min-w-0">
            {teamBLogo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={teamBLogo} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" onError={(e) => { e.currentTarget.style.display = "none"; }} />
            )}
            <span className={`font-bold text-lg truncate ${teamBWins > teamAWins ? "text-red-400" : "text-gray-400"}`}>
              {teamBName}
            </span>
          </div>
          <span className={`font-mono text-3xl font-bold shrink-0 ml-4 ${teamBWins > teamAWins ? "text-red-400" : "text-gray-300"}`}>
            {teamBWins}
          </span>
        </div>
      </div>
    </div>
  );
}
