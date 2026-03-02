"use client";

import { useState, useEffect } from "react";
import { cacheGet, cacheSet, cacheKey } from "@/lib/espn-cache";
import { parseLeagueScoringConfig, DEFAULT_SCORING_CONFIG } from "@/lib/scoring-config";
import { SPORT_CONFIGS } from "@/lib/sports-config";
import type { LeagueInfo, LeagueTeam, LeagueScoringConfig, EspnSport } from "@/lib/types";

function parseLeagueData(data: Record<string, unknown>, irSlotIds: number[]): LeagueInfo {
  const irSet = new Set(irSlotIds);
  const teams: LeagueTeam[] = ((data.teams as unknown[]) ?? []).map((t: unknown) => {
    const team = t as Record<string, unknown>;

    const name = (team.name as string)
      || `${(team.location as string) ?? ""} ${(team.nickname as string) ?? ""}`.trim()
      || (team.abbrev as string)
      || `Team ${team.id}`;

    const rosterEntries = ((team.roster as Record<string, unknown>)?.entries ?? []) as unknown[];

    // Two-pass IR filter:
    // Pass 1 — identify every player ID that appears in ANY IR/IL lineup slot.
    //           A player might appear twice (IR slot + a normal slot) in unusual API responses;
    //           if they have any IR entry they are considered on IR and fully excluded.
    const irPlayerIds = new Set<number>();
    if (irSet.size > 0) {
      for (const e of rosterEntries) {
        const entry = e as Record<string, unknown>;
        const ppe = entry.playerPoolEntry as Record<string, unknown> | undefined;
        const slotId = Number(entry.lineupSlotId ?? ppe?.lineupSlotId ?? -1);
        if (irSet.has(slotId)) {
          const pid = Number(entry.playerId ?? ppe?.playerId ?? 0);
          if (pid > 0) irPlayerIds.add(pid);
        }
      }
    }
    // Pass 2 — collect unique player IDs that are NOT on IR.
    const seen = new Set<number>();
    const rosterPlayerIds: number[] = [];
    for (const e of rosterEntries) {
      const entry = e as Record<string, unknown>;
      const ppe = entry.playerPoolEntry as Record<string, unknown> | undefined;
      const pid = Number(entry.playerId ?? ppe?.playerId ?? 0);
      if (pid > 0 && !irPlayerIds.has(pid) && !seen.has(pid)) {
        seen.add(pid);
        rosterPlayerIds.push(pid);
      }
    }
    const primaryOwner =
      (team.primaryOwner as string) ??
      ((team.owners as string[])?.[0]) ??
      "";

    return {
      id: team.id as number,
      name,
      abbreviation: (team.abbrev as string) ?? "",
      ownerId: primaryOwner.toLowerCase(),
      rosterPlayerIds,
      logo: (team.logo as string) || undefined,
    };
  });

  // Extract active lineup slot IDs (count > 0) so position parsing can be league-specific.
  const slotCounts = (
    ((data.settings as Record<string, unknown>)?.rosterSettings as Record<string, unknown>)
      ?.lineupSlotCounts
  ) as Record<string, number> | undefined;
  const activeLineupSlotIds = slotCounts
    ? Object.entries(slotCounts)
        .filter(([, count]) => count > 0)
        .map(([id]) => Number(id))
    : undefined;

  return {
    leagueId: String(data.id ?? ""),
    seasonId: (data.seasonId as number) ?? 2026,
    scoringPeriodId: ((data.status as Record<string, unknown>)?.currentMatchupPeriod as number)
      ?? (data.scoringPeriodId as number)
      ?? 1,
    teams,
    activeLineupSlotIds,
  };
}

export function useLeague(leagueId: string, espnS2: string, swid: string, sport: EspnSport = "fba") {
  const [league, setLeague] = useState<LeagueInfo | null>(null);
  const [scoringConfig, setScoringConfig] = useState<LeagueScoringConfig>(DEFAULT_SCORING_CONFIG);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sportCfg = SPORT_CONFIGS[sport] ?? SPORT_CONFIGS.fba;
    // Always reset to the sport-appropriate default first so switching sports
    // never shows a stale config from a different sport (e.g. NBA 9-cat for WNBA).
    if (!leagueId || !espnS2 || !swid) {
      setScoringConfig(sportCfg.defaultScoringConfig);
      setLeague(null);
      return;
    }

    // Cache keys include sport to isolate per-sport caches.
    // v11 bumped to force re-fetch with irSlotIds expanded to [13, 20, 21].
    // LeagueScoringConfig contains functions which cannot be JSON-serialised,
    // so we cache the plain settings object and re-parse on every restore.
    const leagueKey   = cacheKey("league",   leagueId, `${sport}_mTeam_v12`);
    const settingsKey = cacheKey("settings",  leagueId, `${sport}_v1`);

    // Remove all previous cache versions so they don't accumulate in localStorage
    if (typeof window !== "undefined") {
      for (const oldKey of [
        "mTeam_v3", "mTeam_v4", "mTeam_v5", "mTeam_v6", "mTeam_v7",
        "mTeam_v8", "mTeam_v9", "mTeam_v10", "mTeam_v11",
        `${sport}_mTeam_v3`, `${sport}_mTeam_v4`, `${sport}_mTeam_v5`, `${sport}_mTeam_v6`,
        `${sport}_mTeam_v7`, `${sport}_mTeam_v8`, `${sport}_mTeam_v9`, `${sport}_mTeam_v10`,
        `${sport}_mTeam_v11`,
      ]) {
        localStorage.removeItem(cacheKey("league", leagueId, oldKey));
      }
    }

    const cachedLeague   = cacheGet<LeagueInfo>(leagueKey);
    const cachedSettings = cacheGet<unknown>(settingsKey);

    // Only use the cache if BOTH entries exist — if settings are missing, fall through to fetch
    // so we always have the real scoring config (not the default fallback).
    if (cachedLeague && cachedSettings) {
      setLeague(cachedLeague);
      // Re-parse config from cached raw settings (functions survive this way)
      setScoringConfig(parseLeagueScoringConfig(cachedSettings, sportCfg));
      return;
    }

    // Reset to sport default while the fetch is in flight
    setScoringConfig(sportCfg.defaultScoringConfig);
    setLoading(true);
    setError(null);

    fetch(`/api/espn/league?leagueId=${encodeURIComponent(leagueId)}&sport=${sport}`, {
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
          if (res.status === 404) {
            throw new Error("Could not load league. Check that your League ID is correct.");
          }
          throw new Error(detail ? `${msg} — ${detail}` : msg);
        }
        return res.json();
      })
      .then((data: Record<string, unknown>) => {
        const irSlotIds = (SPORT_CONFIGS[sport] ?? SPORT_CONFIGS.fba).irSlotIds;
        const info   = parseLeagueData(data, irSlotIds);
        const config = parseLeagueScoringConfig(data.settings, sportCfg);

        // Cache league info + raw settings (both are plain JSON — no functions)
        cacheSet(leagueKey,   info);
        cacheSet(settingsKey, data.settings);

        setLeague(info);
        setScoringConfig(config);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [leagueId, espnS2, swid, sport]);

  return { league, scoringConfig, loading, error };
}
