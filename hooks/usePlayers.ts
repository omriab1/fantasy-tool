"use client";

import { useState, useEffect, useCallback } from "react";
import { cacheGet, cacheSet, cacheKey } from "@/lib/espn-cache";
import { SPORT_CONFIGS } from "@/lib/sports-config";
import type { PlayerStats, StatsWindow, EspnSport } from "@/lib/types";
import { STAT_IDS } from "@/lib/types";

// Map our window key to ESPN statSplitTypeId
// statSourceId: 0 = actual stats, 1 = projections (proj window)
const SPLIT_TYPE: Record<StatsWindow, number> = {
  season: 0,
  "30": 3,
  "15": 2,
  "7": 1,
  proj: 0,  // projections use split type 0 (full-season), but statSourceId 1
};

function parsePlayerEntry(
  entry: Record<string, unknown>,
  window: StatsWindow,
  seasonYear: number,
  slotPosMap: Record<number, string>,
  defaultPosMap: Record<number, string>,
  gpStatId: number = STAT_IDS.GP,
  activeSlotIds?: number[],
): PlayerStats | null {
  // Structure: { id, player: { fullName, defaultPositionId, proTeamId, stats: [...] } }
  const info = entry.player as Record<string, unknown> | undefined;
  if (!info) return null;

  const statsArr = (info.stats ?? []) as unknown[];
  const targetSplit = SPLIT_TYPE[window];
  const isProj = window === "proj";

  let statsEntry: Record<string, unknown> | null = null;
  for (const s of statsArr) {
    const stat = s as Record<string, unknown>;
    if (
      stat.seasonId === seasonYear &&
      stat.statSourceId === (isProj ? 1 : 0) &&
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

  const gp = get(gpStatId) || get(STAT_IDS.GP);  // hockey GP=30, basketball GP=42
  if (gp === 0) return null;

  const posId = (info.defaultPositionId as number) ?? 9;

  const eligibleSlots =
    (info.eligibleSlots as number[] | undefined) ??
    (entry.eligibleSlots as number[] | undefined) ??
    [];

  let position: string;
  if (activeSlotIds) {
    // Hockey (slot-based leagues): show only the positions that exist in this league's roster.
    // Filter eligible slots to those active in the league AND mapped to a display position,
    // then sort by slot ID to match ESPN's canonical position ordering (C→LW→RW→F→D→G).
    const activeSet = new Set(activeSlotIds);
    const seen = new Set<string>();
    const allPos: string[] = [];
    let mapped = eligibleSlots
      .filter((s) => activeSet.has(s) && s in slotPosMap)
      .map((s) => [s, slotPosMap[s]] as [number, string]);
    mapped.sort(([a], [b]) => a - b);
    // ESPN display rule: F (slot 3) is the generic forward flex slot.
    // If the player has any specific forward slot (C=0, LW=1, RW=2), suppress F —
    // specific positions take precedence over the catch-all. F only shows when
    // no specific forward slot is available in the league for this player.
    const SPECIFIC_FWD = new Set([0, 1, 2]);
    const hasSpecificFwd = mapped.some(([id]) => SPECIFIC_FWD.has(id));
    if (hasSpecificFwd) mapped = mapped.filter(([id]) => id !== 3);
    for (const [, pos] of mapped) {
      if (!seen.has(pos)) { seen.add(pos); allPos.push(pos); }
    }
    position = allPos.length > 0 ? allPos.join(", ") : "UT";
  } else {
    // Basketball / other sports: default position first, then other eligible positions.
    const defaultPosName = defaultPosMap[posId] ?? null;
    const otherPos = [...new Set(
      eligibleSlots
        .filter((s) => s in slotPosMap && slotPosMap[s] !== defaultPosName)
        .map((s) => slotPosMap[s])
    )];
    const allPos = defaultPosName ? [defaultPosName, ...otherPos] : otherPos;
    position = allPos.length > 0 ? allPos.join(", ") : "UT";
  }

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
    // Full ESPN stats dict — all stat IDs available for dynamic league support.
    // Keys are numeric stat IDs (accessed as rawStats[0], rawStats[13], etc.)
    rawStats: raw as unknown as Record<number, number>,
  };
}

export function usePlayers(
  leagueId: string,
  espnS2: string,
  swid: string,
  window: StatsWindow,
  sport: EspnSport = "fba",
  activeSlotIds?: number[],
) {
  const [players, setPlayers] = useState<PlayerStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cfg = SPORT_CONFIGS[sport] ?? SPORT_CONFIGS.fba;
  // Use statsFallbackYear for stat parsing when available (e.g. WNBA in off-season).
  const parseSeasonYear = cfg.statsFallbackYear ?? cfg.seasonYear;

  // For hockey, position labels depend on which lineup slots the league uses.
  // Wait until we know the active slots before fetching so positions are correct.
  // Stable string key so array identity changes don't cause infinite re-fetches.
  const needsSlots = sport === "fhl";
  const slotKey = activeSlotIds ? [...activeSlotIds].sort((a, b) => a - b).join(",") : "";
  const ready = !needsSlots || slotKey !== "";

  // Cache suffix encodes the active slots so each league gets slot-specific cached positions.
  const cacheSuffix = slotKey ? `_s${slotKey}` : "";

  // When the window changes and data is already cached, switch instantly without a fetch.
  useEffect(() => {
    if (!leagueId || !espnS2 || !swid || !ready) return;
    const cached = cacheGet<PlayerStats[]>(cacheKey("players_v7", leagueId, `${sport}_${window}${cacheSuffix}`));
    if (cached) setPlayers(cached);
  }, [leagueId, espnS2, swid, window, sport, ready, cacheSuffix]);

  const load = useCallback(() => {
    if (!leagueId || !espnS2 || !swid || !ready) return;

    // If the requested window is already cached, show it immediately (no spinner).
    const key = cacheKey("players_v7", leagueId, `${sport}_${window}${cacheSuffix}`);
    const cached = cacheGet<PlayerStats[]>(key);
    if (cached) {
      setPlayers(cached);
      return;
    }

    setLoading(true);
    setError(null);

    fetch(
      `/api/espn/players?leagueId=${encodeURIComponent(leagueId)}&window=${encodeURIComponent(window)}&sport=${sport}`,
      { headers: { "x-espn-s2": espnS2, "x-espn-swid": swid } }
    )
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
        // Parse and cache ALL available windows from this single response so switching is instant.
        const slots = slotKey ? activeSlotIds : undefined;
        for (const w of cfg.availableWindows) {
          const parsed: PlayerStats[] = [];
          for (const p of arr) {
            const stats = parsePlayerEntry(
              p as Record<string, unknown>,
              w,
              parseSeasonYear,
              cfg.slotPosMap,
              cfg.defaultPosMap,
              cfg.gpStatId ?? STAT_IDS.GP,
              slots,
            );
            if (stats) parsed.push(stats);
          }
          cacheSet(cacheKey("players_v7", leagueId, `${sport}_${w}${cacheSuffix}`), parsed);
          if (w === window) setPlayers(parsed);
        }
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [leagueId, espnS2, swid, window, sport, cfg, parseSeasonYear, ready, cacheSuffix, slotKey, activeSlotIds]);

  useEffect(() => {
    load();
  }, [load]);

  return { players, loading, error, reload: load };
}
