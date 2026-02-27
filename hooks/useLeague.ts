"use client";

import { useState, useEffect } from "react";
import { cacheGet, cacheSet, cacheKey } from "@/lib/espn-cache";
import { parseLeagueScoringConfig, DEFAULT_SCORING_CONFIG } from "@/lib/scoring-config";
import type { LeagueInfo, LeagueTeam, LeagueScoringConfig, EspnSport } from "@/lib/types";

function parseLeagueData(data: Record<string, unknown>): LeagueInfo {
  const teams: LeagueTeam[] = ((data.teams as unknown[]) ?? []).map((t: unknown) => {
    const team = t as Record<string, unknown>;

    const name = (team.name as string)
      || `${(team.location as string) ?? ""} ${(team.nickname as string) ?? ""}`.trim()
      || (team.abbrev as string)
      || `Team ${team.id}`;

    const rosterEntries = ((team.roster as Record<string, unknown>)?.entries ?? []) as unknown[];
    const rosterPlayerIds = rosterEntries
      .map((e) => (e as Record<string, unknown>).playerId as number)
      .filter(Boolean);

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

  return {
    leagueId: String(data.id ?? ""),
    seasonId: (data.seasonId as number) ?? 2026,
    scoringPeriodId: ((data.status as Record<string, unknown>)?.currentMatchupPeriod as number)
      ?? (data.scoringPeriodId as number)
      ?? 1,
    teams,
  };
}

export function useLeague(leagueId: string, espnS2: string, swid: string, sport: EspnSport = "fba") {
  const [league, setLeague] = useState<LeagueInfo | null>(null);
  const [scoringConfig, setScoringConfig] = useState<LeagueScoringConfig>(DEFAULT_SCORING_CONFIG);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!leagueId || !espnS2 || !swid) return;

    // Cache keys include sport to isolate per-sport caches.
    // LeagueScoringConfig contains functions which cannot be JSON-serialised,
    // so we cache the plain settings object and re-parse on every restore.
    const leagueKey   = cacheKey("league",   leagueId, `${sport}_mTeam_v3`);
    const settingsKey = cacheKey("settings",  leagueId, `${sport}_v1`);

    // Remove legacy NBA-only cache entries (no sport prefix)
    if (typeof window !== "undefined") {
      localStorage.removeItem(cacheKey("league",   leagueId, "mTeam_v3"));
      localStorage.removeItem(cacheKey("settings", leagueId, "v1"));
      localStorage.removeItem(cacheKey("league",   leagueId, "v4"));
    }

    const cachedLeague   = cacheGet<LeagueInfo>(leagueKey);
    const cachedSettings = cacheGet<unknown>(settingsKey);

    // Only use the cache if BOTH entries exist — if settings are missing, fall through to fetch
    // so we always have the real scoring config (not the default fallback).
    if (cachedLeague && cachedSettings) {
      setLeague(cachedLeague);
      // Re-parse config from cached raw settings (functions survive this way)
      setScoringConfig(parseLeagueScoringConfig(cachedSettings));
      return;
    }

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
        const info   = parseLeagueData(data);
        const config = parseLeagueScoringConfig(data.settings);

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
