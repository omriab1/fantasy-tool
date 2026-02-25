"use client";

import type { LeagueTeam } from "@/lib/types";

interface Props {
  teams: LeagueTeam[];
  value: number | null;
  onChange: (teamId: number) => void;
  label?: string;
  disabled?: boolean;
}

export function TeamSelector({ teams, value, onChange, label, disabled }: Props) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs text-gray-500 uppercase tracking-widest">{label}</label>}
      <select
        value={value ?? ""}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="bg-[#0f1117] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#e8193c]/60 disabled:opacity-50"
      >
        <option value="" disabled>
          Select team…
        </option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </div>
  );
}
