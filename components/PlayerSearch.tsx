"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import type { PlayerStats, EspnSport } from "@/lib/types";
import { SPORT_CONFIGS } from "@/lib/sports-config";

interface Props {
  players: PlayerStats[];
  onAdd: (player: PlayerStats) => void;
  placeholder?: string;
  exclude?: number[]; // playerIds already in buckets
  sport?: EspnSport;
}

export function PlayerSearch({ players, onAdd, placeholder = "Search players…", exclude = [], sport = "fba" }: Props) {
  const cdn = SPORT_CONFIGS[sport]?.cdnLeague ?? "nba";
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    if (query.trim().length < 2) return [];
    const q = query.toLowerCase();
    return players
      .filter(
        (p) =>
          !exclude.includes(p.playerId) &&
          p.playerName.toLowerCase().includes(q)
      )
      .slice(0, 12);
  }, [query, players, exclude]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelect(player: PlayerStats) {
    onAdd(player);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="w-full bg-[#0f1117] border border-white/10 rounded-lg px-3 py-2 text-base text-white placeholder-gray-600 focus:outline-none focus:border-[#e8193c]/60"
      />
      {open && results.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full bg-[#1a1f2e] border border-white/10 rounded-lg shadow-xl overflow-hidden max-h-64 overflow-y-auto">
          {results.map((p) => (
            <li key={p.playerId}>
              <button
                onMouseDown={() => handleSelect(p)}
                className="w-full text-left px-3 py-2 hover:bg-white/5 flex items-center gap-2 text-sm"
              >
                <div className="relative shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://a.espncdn.com/i/headshots/${cdn}/players/full/${p.playerId}.png`}
                    alt=""
                    className="w-8 h-8 rounded-full object-cover bg-white/10"
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                  {p.teamAbbrev !== "0" && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`https://a.espncdn.com/i/teamlogos/${cdn}/500/${p.teamAbbrev}.png`}
                      alt=""
                      className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full object-cover bg-[#1a1f2e] ring-1 ring-[#1a1f2e]"
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                  )}
                </div>
                <span className="text-white font-medium flex-1">{p.playerName}</span>
                <span className="text-gray-500 text-xs shrink-0">{p.position}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && query.trim().length >= 2 && results.length === 0 && (
        <div className="absolute z-50 mt-1 w-full bg-[#1a1f2e] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-500">
          No players found
        </div>
      )}
    </div>
  );
}
