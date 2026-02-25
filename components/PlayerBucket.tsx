import type { PlayerStats } from "@/lib/types";

interface Props {
  label: string;
  players: PlayerStats[];
  onRemove: (playerId: number) => void;
  accentClass?: string; // e.g. "border-red-500/50" or "border-green-500/50"
}

export function PlayerBucket({ label, players, onRemove, accentClass = "border-white/10" }: Props) {
  return (
    <div className={`bg-[#1a1f2e] border ${accentClass} rounded-xl p-4 flex flex-col gap-3`}>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{label}</p>
      {players.length === 0 ? (
        <p className="text-gray-600 text-sm italic">No players added yet</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {players.map((p) => (
            <li
              key={p.playerId}
              className="flex items-center gap-2 text-sm bg-white/5 rounded-lg px-3 py-2"
            >
              <div className="relative shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://a.espncdn.com/i/headshots/nba/players/full/${p.playerId}.png`}
                  alt=""
                  className="w-8 h-8 rounded-full object-cover bg-white/10"
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
                {p.teamAbbrev !== "0" && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`https://a.espncdn.com/i/teamlogos/nba/500/${p.teamAbbrev}.png`}
                    alt=""
                    className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full object-cover bg-[#1a1f2e] ring-1 ring-[#1a1f2e]"
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                )}
              </div>
              <span className="flex-1 text-white font-medium">{p.playerName}</span>
              <span className="text-gray-500 text-xs">{p.position}</span>
              <button
                onClick={() => onRemove(p.playerId)}
                className="text-gray-600 hover:text-red-400 transition-colors ml-1 text-base leading-none"
                aria-label={`Remove ${p.playerName}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
