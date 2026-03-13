"use client";

/**
 * Yahoo Fantasy League hook.
 *
 * Parallel to useLeague.ts but for Yahoo Fantasy Sports.
 * Calls /api/yahoo/league and parses the Yahoo-format response into
 * LeagueInfo + LeagueScoringConfig.
 *
 * Cache key prefix: "yahoo_" to isolate from ESPN cache entries.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { cacheGet, cacheSet, clearYahooCache } from "@/lib/espn-cache";
import { parseYahooLeagueScoringConfig, YAHOO_NBA_DEFAULT_SCORING_CONFIG } from "@/lib/yahoo-scoring-config";
import { getValidYahooToken } from "@/lib/yahoo-auth";
import type { LeagueInfo, LeagueTeam, LeagueScoringConfig } from "@/lib/types";

/** Yahoo-specific cache key (avoids espn_cache_ prefix from espn-cache.ts) */
function yahooCacheKey(endpoint: string, leagueKey: string, params: string): string {
  return `yahoo_cache_${endpoint}_${leagueKey}_${params}`;
}

/**
 * Parse Yahoo Fantasy API response into LeagueInfo.
 *
 * Yahoo structure:
 * {
 *   league: {
 *     fantasy_content: { league: [metadata, { settings, standings, scoreboard }] }
 *   },
 *   teams: {
 *     fantasy_content: { league: [metadata, { teams: { "0": { team: [...] }, count: N } }] }
 *   }
 * }
 */
function parseYahooLeagueData(data: Record<string, unknown>): LeagueInfo {
  // Extract from league response
  const leagueContent = data.league as Record<string, unknown> | undefined;
  const fc = leagueContent?.fantasy_content as Record<string, unknown> | undefined;
  const leagueArr = fc?.league as unknown[];
  const leagueMeta = Array.isArray(leagueArr) ? leagueArr[0] as Record<string, unknown> : {};

  const leagueKey = String(leagueMeta?.league_key ?? "");
  const leagueId  = String(leagueMeta?.league_id ?? leagueKey);
  const season    = Number(leagueMeta?.season ?? 2025);
  const currentWeek = Number(leagueMeta?.current_week ?? 1);

  // Extract teams from the teams response
  const teamsContent = data.teams as Record<string, unknown> | undefined;
  const teamsFc = teamsContent?.fantasy_content as Record<string, unknown> | undefined;
  const teamsLeagueArr = teamsFc?.league as unknown[];
  const teamsData = Array.isArray(teamsLeagueArr) && teamsLeagueArr.length > 1
    ? (teamsLeagueArr[1] as Record<string, unknown>)?.teams as Record<string, unknown> | undefined
    : undefined;

  const teams: LeagueTeam[] = [];

  if (teamsData) {
    const count = Number(teamsData.count ?? 0);
    for (let i = 0; i < count; i++) {
      const entry = teamsData[String(i)] as Record<string, unknown> | undefined;
      const teamArr = entry?.team as unknown[];
      if (!Array.isArray(teamArr) || teamArr.length === 0) continue;

      // teamArr[0] is an array of metadata objects
      const metaArr = teamArr[0] as unknown[];
      let teamId = i + 1;
      let teamName = `Team ${i + 1}`;
      let abbrev = "";
      let ownerId = "";
      const rosterPlayerIds: string[] = [];
      let logo: string | undefined;

      if (Array.isArray(metaArr)) {
        for (const m of metaArr) {
          const mObj = m as Record<string, unknown> | undefined;
          if (!mObj) continue;
          if (mObj.team_id !== undefined) teamId = Number(mObj.team_id);
          if (mObj.name) teamName = String(mObj.name);
          if (mObj.team_abbr) abbrev = String(mObj.team_abbr).toUpperCase();
          // Team logo
          if (mObj.team_logos) {
            const logos = (mObj.team_logos as Record<string, unknown>)?.team_logo;
            if (Array.isArray(logos) && logos.length > 0) {
              logo = String((logos[0] as Record<string, unknown>)?.url ?? "");
            }
          }
          // Manager — Yahoo identifies managers by their guid
          if (mObj.managers) {
            const managerArr = (mObj.managers as Record<string, unknown>)?.manager;
            const mgr = Array.isArray(managerArr) ? managerArr[0] : managerArr;
            if (mgr) {
              const mgrObj = mgr as Record<string, unknown>;
              const guid = String(mgrObj?.guid ?? "");
              if (guid) ownerId = guid.toLowerCase();
            }
          }
        }
      }

      // teamArr[1] may contain roster
      if (teamArr.length > 1) {
        const rosterData = teamArr[1] as Record<string, unknown> | undefined;
        const roster = rosterData?.roster as Record<string, unknown> | undefined;
        const playersObj = roster?.players as Record<string, unknown> | undefined;
        if (playersObj) {
          const pCount = Number(playersObj.count ?? 0);
          for (let j = 0; j < pCount; j++) {
            const pEntry = playersObj[String(j)] as Record<string, unknown> | undefined;
            const pArr = pEntry?.player as unknown[];
            if (!Array.isArray(pArr)) continue;
            const pMetaArr = pArr[0] as unknown[];
            if (!Array.isArray(pMetaArr)) continue;
            for (const pm of pMetaArr) {
              const pmObj = pm as Record<string, unknown> | undefined;
              if (pmObj?.player_key) {
                rosterPlayerIds.push(String(pmObj.player_key));
                break;
              }
            }
          }
        }
      }

      // Convert Yahoo player_keys to numeric IDs for compatibility with PlayerStats.playerId
      const numericRosterIds = rosterPlayerIds.map(key => {
        const m = key.match(/\.p\.(\d+)$/);
        return m ? Number(m[1]) : 0;
      }).filter(id => id > 0);

      teams.push({
        id: teamId,
        name: teamName,
        abbreviation: abbrev,
        ownerId,
        rosterPlayerIds: numericRosterIds,
        logo,
      });
    }
  }

  return {
    leagueId,
    seasonId: season,
    scoringPeriodId: currentWeek,
    teams,
    name: leagueMeta?.name ? String(leagueMeta.name) : undefined,
  };
}

/**
 * Extract Yahoo league settings for scoring config parsing.
 * Returns the settings object from fantasy_content.league[1].settings
 *
 * Yahoo sometimes double-wraps settings as a fake-array:
 *   league[1].settings = { "0": { stat_categories: {...}, ... } }
 * In that case we unwrap and return settings["0"].
 */
function extractYahooSettings(data: Record<string, unknown>): unknown {
  try {
    const leagueContent = data.league as Record<string, unknown> | undefined;
    const fc = leagueContent?.fantasy_content as Record<string, unknown> | undefined;
    const leagueArr = fc?.league as unknown[];
    if (!Array.isArray(leagueArr) || leagueArr.length < 2) return null;
    const leagueData = leagueArr[1] as Record<string, unknown> | undefined;
    const settings = leagueData?.settings as Record<string, unknown> | null ?? null;
    if (!settings) return null;
    // Unwrap extra fake-array layer: settings = {"0": {stat_categories:…}, …}
    if (!settings.stat_categories && settings["0"]) {
      return settings["0"] as Record<string, unknown>;
    }
    return settings;
  } catch {
    return null;
  }
}

export function useYahooLeague(
  leagueKey: string,
  b: string,
  _t: string,
) {
  const [league, setLeague] = useState<LeagueInfo | null>(null);
  const [scoringConfig, setScoringConfig] = useState<LeagueScoringConfig>(YAHOO_NBA_DEFAULT_SCORING_CONFIG);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  // Keep stable refs to avoid stale closures in the effect
  const bRef  = useRef(b);
  const tRef  = useRef(_t);
  bRef.current = b;
  tRef.current = _t;

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const rawToken = localStorage.getItem("yahoo_access_token") ?? "";
      if (!leagueKey || (!bRef.current && !rawToken)) {
        setScoringConfig(YAHOO_NBA_DEFAULT_SCORING_CONFIG);
        setLeague(null);
        return;
      }

      const leagueCacheKey   = yahooCacheKey("league",   leagueKey, "v1");
      const settingsCacheKey = yahooCacheKey("settings", leagueKey, "v1");

      const cachedLeague   = cacheGet<LeagueInfo>(leagueCacheKey);
      const cachedSettings = cacheGet<unknown>(settingsCacheKey);

      if (cachedLeague && cachedSettings) {
        if (!cancelled) {
          setLeague(cachedLeague);
          setScoringConfig(parseYahooLeagueScoringConfig(cachedSettings));
        }
        return;
      }

      if (!cancelled) {
        setScoringConfig(YAHOO_NBA_DEFAULT_SCORING_CONFIG);
        setLoading(true);
        setError(null);
      }

      try {
        const accessToken = rawToken ? await getValidYahooToken() : "";
        if (cancelled) return;

        const authHeaders: Record<string, string> = accessToken
          ? { "x-yahoo-access-token": accessToken }
          : { "x-yahoo-b": bRef.current, "x-yahoo-t": tRef.current };

        const res = await fetch(`/api/yahoo/league?leagueKey=${encodeURIComponent(leagueKey)}`, {
          headers: authHeaders,
        });
        if (cancelled) return;

        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as Record<string, unknown>;
          const msg = (body.error as string) ?? `HTTP ${res.status}`;
          if (res.status === 401 || res.status === 403) {
            throw new Error("Yahoo credentials rejected. Try reconnecting via Quick Connect in Settings.");
          }
          if (res.status === 404) {
            throw new Error("Yahoo league not found. Check your league key.");
          }
          throw new Error(msg);
        }

        const data = await res.json() as Record<string, unknown>;
        if (cancelled) return;

        const info     = parseYahooLeagueData(data);
        const settings = extractYahooSettings(data);
        const config   = parseYahooLeagueScoringConfig(settings);

        cacheSet(leagueCacheKey,   info);
        cacheSet(settingsCacheKey, settings);

        setLeague(info);
        setScoringConfig(config);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => { cancelled = true; };
  }, [leagueKey, version]); // b/_t read via refs so they don't retrigger on every keystroke

  /** Clear cache and force re-fetch (use when league settings changed on Yahoo) */
  const reload = useCallback(() => {
    if (leagueKey) clearYahooCache(leagueKey);
    setVersion(v => v + 1);
  }, [leagueKey]);

  return { league, scoringConfig, loading, error, reload };
}
