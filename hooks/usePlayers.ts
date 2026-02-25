"use client";

import { useState, useEffect, useCallback } from "react";
import { cacheGet, cacheSet, cacheKey } from "@/lib/espn-cache";
import type { PlayerStats, StatsWindow } from "@/lib/types";
import { STAT_IDS } from "@/lib/types";

// ESPN eligibleSlots 0-4 are the real position slots
const SLOT_POS: Record<number, string> = {
  0: "PG", 1: "SG", 2: "SF", 3: "PF", 4: "C",
};

// Fallback for defaultPositionId
const POS_MAP: Record<number, string> = {
  1: "PG", 2: "SG", 3: "SF", 4: "PF", 5: "C",
  6: "PG/SG", 7: "SG/SF", 8: "SF/PF", 9: "PF/C",
};

// Map our window key to ESPN statSplitTypeId (all use statSourceId=0, seasonId=2026)
const SPLIT_TYPE: Record<StatsWindow, number> = {
  season: 0,
  "30": 3,
  "15": 2,
  "7": 1,
};

function parsePlayerEntry(entry: Record<string, unknown>, window: StatsWindow): PlayerStats | null {
  // Structure: { id, player: { fullName, defaultPositionId, proTeamId, stats: [...] } }
  const info = entry.player as Record<string, unknown> | undefined;
  if (!info) return null;

  const statsArr = (info.stats ?? []) as unknown[];
  const targetSplit = SPLIT_TYPE[window];

  let statsEntry: Record<string, unknown> | null = null;
  for (const s of statsArr) {
    const stat = s as Record<string, unknown>;
    if (
      stat.seasonId === 2026 &&
      stat.statSourceId === 0 &&
      stat.statSplitTypeId === targetSplit
    ) {
      statsEntry = stat;
      break;
    }
  }

  if (!statsEntry) return null;

  // `stats` contains season/window TOTALS
  const raw = (statsEntry.stats ?? {}) as Record<string, number>;
  const get = (id: number) => raw[String(id)] ?? 0;

  const gp = get(STAT_IDS.GP);
  if (gp === 0) return null;

  const posId = (info.defaultPositionId as number) ?? 9;

  // Build position string from eligibleSlots (ESPN order), filtering to real position slots only
  const eligibleSlots = (info.eligibleSlots as number[]) ?? [];
  const posList = [...new Set(eligibleSlots.filter((s) => s in SLOT_POS).map((s) => SLOT_POS[s]))];
  const position = posList.length > 0 ? posList.join(", ") : (POS_MAP[posId] ?? "UT");

  return {
    playerId: (entry.id as number) ?? 0,
    playerName: (info.fullName as string) ?? "Unknown",
    teamAbbrev: String(info.proTeamId ?? "0"),
    position,
    // Store totals — aggregateStats will sum these and divide by total GP
    pts: get(STAT_IDS.PTS),
    reb: get(STAT_IDS.REB),
    ast: get(STAT_IDS.AST),
    stl: get(STAT_IDS.STL),
    blk: get(STAT_IDS.BLK),
    to: get(STAT_IDS.TO),
    threepm: get(STAT_IDS["3PM"]),
    fgm: get(STAT_IDS.FGM),
    fga: get(STAT_IDS.FGA),
    ftm: get(STAT_IDS.FTM),
    fta: get(STAT_IDS.FTA),
    threepa: get(STAT_IDS["3PA"]),
    gp,
  };
}

export function usePlayers(leagueId: string, espnS2: string, swid: string, window: StatsWindow) {
  const [players, setPlayers] = useState<PlayerStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!leagueId || !espnS2 || !swid) return;

    const key = cacheKey("players", leagueId, window);
    const cached = cacheGet<PlayerStats[]>(key);
    if (cached) {
      setPlayers(cached);
      return;
    }

    setLoading(true);
    setError(null);

    fetch(`/api/espn/players?leagueId=${encodeURIComponent(leagueId)}&window=${encodeURIComponent(window)}`, {
      headers: { "x-espn-s2": espnS2, "x-espn-swid": swid },
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as Record<string, unknown>;
          const detail = (body.detail as string) ?? "";
          const msg = (body.error as string) ?? `HTTP ${res.status}`;
          if (res.status === 401 || res.status === 403) {
            throw new Error("Credentials rejected by ESPN. Try refreshing your espn_s2 cookie.");
          }
          throw new Error(detail ? `${msg} — ${detail}` : msg);
        }
        return res.json();
      })
      .then((data: unknown) => {
        const arr = Array.isArray(data) ? data : [];
        const parsed: PlayerStats[] = [];
        for (const p of arr) {
          const stats = parsePlayerEntry(p as Record<string, unknown>, window);
          if (stats) parsed.push(stats);
        }
        cacheSet(key, parsed);
        setPlayers(parsed);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [leagueId, espnS2, swid, window]);

  useEffect(() => {
    load();
  }, [load]);

  return { players, loading, error, reload: load };
}
