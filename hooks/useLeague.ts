"use client";

import { useState, useEffect } from "react";
import { cacheGet, cacheSet, cacheKey } from "@/lib/espn-cache";
import type { LeagueInfo, LeagueTeam } from "@/lib/types";

function parseLeagueData(data: Record<string, unknown>): LeagueInfo {
  const teams: LeagueTeam[] = ((data.teams as unknown[]) ?? []).map((t: unknown) => {
    const team = t as Record<string, unknown>;

    // ESPN returns `name` directly on the team object
    const name = (team.name as string)
      || `${(team.location as string) ?? ""} ${(team.nickname as string) ?? ""}`.trim()
      || (team.abbrev as string)
      || `Team ${team.id}`;

    // Extract current roster player IDs from mRoster view
    const rosterEntries = ((team.roster as Record<string, unknown>)?.entries ?? []) as unknown[];
    const rosterPlayerIds = rosterEntries
      .map((e) => (e as Record<string, unknown>).playerId as number)
      .filter(Boolean);

    // primaryOwner may be a string or in an owners array
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
    };
  });

  return {
    leagueId: String(data.id ?? ""),
    seasonId: (data.seasonId as number) ?? 2026,
    // Use currentMatchupPeriod from status (local week #), not global scoringPeriodId
    scoringPeriodId: ((data.status as Record<string, unknown>)?.currentMatchupPeriod as number)
      ?? (data.scoringPeriodId as number)
      ?? 1,
    teams,
  };
}

export function useLeague(leagueId: string, espnS2: string, swid: string) {
  const [league, setLeague] = useState<LeagueInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!leagueId || !espnS2 || !swid) return;

    const key = cacheKey("league", leagueId, "mTeam_v3");
    const cached = cacheGet<LeagueInfo>(key);
    if (cached) {
      setLeague(cached);
      return;
    }

    setLoading(true);
    setError(null);

    fetch(`/api/espn/league?leagueId=${encodeURIComponent(leagueId)}`, {
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
        const info = parseLeagueData(data);
        cacheSet(key, info);
        setLeague(info);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [leagueId, espnS2, swid]);

  return { league, loading, error };
}
