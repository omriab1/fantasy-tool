/**
 * Yahoo Fantasy Players proxy.
 *
 * GET /api/yahoo/players?leagueKey=428.l.19877&window=season
 *
 * Headers:
 *   x-yahoo-b  — Yahoo B cookie
 *   x-yahoo-t  — Yahoo T cookie
 *
 * Fetches all rostered players in the league with their stats for the requested window.
 * Returns normalized PlayerStats[] compatible with aggregateStats / calcTradeScore.
 *
 * Yahoo API strategy:
 *   1. GET /fantasy/v2/league/{leagueKey}/teams;out=roster?format=json
 *      → collect all player_keys from all teams' rosters
 *   2. GET /fantasy/v2/players;player_keys={p1,p2,...};out=stats?stat_type={type}&format=json
 *      → fetch stats for up to 25 players per request (Yahoo's limit)
 *      → paginate until all players are fetched
 *
 * Window → Yahoo stat_type mapping:
 *   season → "season"
 *   30     → "lastmonth"
 *   14     → "last14days"
 *   7      → "lastweek"
 *
 * Yahoo stat IDs (NBA) — see lib/yahoo-scoring-config.ts for full reference:
 *   5=FGM, 6=FGA(synthetic), 8=FTM, 9=FTA(synthetic), 11=3PM, 14=PTS,
 *   15=REB, 18=AST, 19=STL, 20=BLK, 21=TO, 0=GP
 *
 * FG%/FT% fraction parsing:
 *   Yahoo sends stat_id=5 value as "168/352" (made/attempted) for FG%.
 *   We split this into rawStats[5]=168 and rawStats[6]=352 so the compute function
 *   in YAHOO_NBA_STAT_MAP can do rawStats[5] / rawStats[6].
 */

import { NextRequest, NextResponse } from "next/server";
import { YAHOO_STAT } from "@/lib/yahoo-scoring-config";

const YAHOO_API_BASE = "https://fantasysports.yahooapis.com/fantasy/v2";
const MAX_PLAYERS_PER_REQUEST = 25; // Yahoo API limit per request

/** Window key → Yahoo stat_type param */
const WINDOW_TO_STAT_TYPE: Record<string, string> = {
  season:  "season",
  "30":    "lastmonth",
  "14":    "last14days",
  "7":     "lastweek",
  proj:    "season",  // projections not yet supported; fall back to season
};

async function yahooFetch(url: string, accessToken: string, b: string, t: string) {
  const headers: Record<string, string> = {
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
  };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  } else {
    headers["Cookie"] = `B=${b}; T=${t}`;
    headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    headers["Referer"]    = "https://basketball.fantasysports.yahoo.com/";
    headers["Origin"]     = "https://basketball.fantasysports.yahoo.com";
  }
  return fetch(url, { headers, cache: "no-store" });
}

/**
 * Parse a Yahoo stat value into a numeric result.
 * Handles:
 *   - Numeric strings: "150" → 150
 *   - Fraction strings: "168/352" → [168, 352] (returns { made, attempted })
 *   - Empty/null: → 0
 */
function parseStatValue(value: unknown): { value: number; attempted?: number } {
  if (value === null || value === undefined || value === "-") return { value: 0 };
  const str = String(value).trim();
  if (str.includes("/")) {
    const [madeStr, attStr] = str.split("/");
    const made = parseFloat(madeStr ?? "0");
    const att = parseFloat(attStr ?? "0");
    return { value: isNaN(made) ? 0 : made, attempted: isNaN(att) ? 0 : att };
  }
  const num = parseFloat(str);
  return { value: isNaN(num) ? 0 : num };
}

/**
 * Extract all player_keys from a Yahoo teams+roster response.
 * Yahoo format: fantasy_content.league[1].teams.{n}.team[1].roster.players.{n}.player[0]
 */
function extractPlayerKeysFromRoster(data: unknown): string[] {
  try {
    const fc = (data as Record<string, unknown>)?.fantasy_content as Record<string, unknown> | undefined;
    const league = fc?.league as unknown[];
    if (!Array.isArray(league) || league.length < 2) return [];

    const leagueData = league[1] as Record<string, unknown>;
    const teams = leagueData?.teams as Record<string, unknown> | undefined;
    if (!teams) return [];

    const playerKeys: string[] = [];
    const count = Number(teams.count ?? 0);

    for (let i = 0; i < count; i++) {
      const teamEntry = teams[String(i)] as Record<string, unknown> | undefined;
      const teamArr = teamEntry?.team as unknown[];
      if (!Array.isArray(teamArr) || teamArr.length < 2) continue;

      const rosterData = teamArr[1] as Record<string, unknown> | undefined;
      const players = rosterData?.roster as Record<string, unknown> | undefined;
      const playersObj = players?.players as Record<string, unknown> | undefined;
      if (!playersObj) continue;

      const playerCount = Number(playersObj.count ?? 0);
      for (let j = 0; j < playerCount; j++) {
        const pEntry = playersObj[String(j)] as Record<string, unknown> | undefined;
        const pArr = pEntry?.player as unknown[];
        if (!Array.isArray(pArr) || pArr.length === 0) continue;

        // player[0] is an array of metadata objects
        const meta = pArr[0] as unknown[];
        if (!Array.isArray(meta)) continue;

        for (const m of meta) {
          const mObj = m as Record<string, unknown> | undefined;
          if (mObj?.player_key) {
            playerKeys.push(String(mObj.player_key));
            break;
          }
        }
      }
    }

    return [...new Set(playerKeys)];
  } catch {
    return [];
  }
}

/**
 * Parse player stats from Yahoo players?out=stats response.
 * Yahoo format: fantasy_content.players.{n}.player[0] = metadata array, player[1] = stats
 */
function parsePlayersWithStats(data: unknown): Array<{
  playerKey: string;
  name: string;
  teamAbbrev: string;
  position: string;
  rawStats: Record<number, number>;
  gp: number;
}> {
  const results: Array<{
    playerKey: string;
    name: string;
    teamAbbrev: string;
    position: string;
    rawStats: Record<number, number>;
    gp: number;
  }> = [];

  try {
    const fc = (data as Record<string, unknown>)?.fantasy_content as Record<string, unknown> | undefined;
    const playersObj = fc?.players as Record<string, unknown> | undefined;
    if (!playersObj) return results;

    const count = Number(playersObj.count ?? 0);
    for (let i = 0; i < count; i++) {
      const pEntry = playersObj[String(i)] as Record<string, unknown> | undefined;
      const pArr = pEntry?.player as unknown[];
      if (!Array.isArray(pArr) || pArr.length < 2) continue;

      // pArr[0] = array of metadata objects (name, team, position, etc.)
      const metaArr = pArr[0] as unknown[];
      let playerKey = "";
      let name = "Unknown";
      let teamAbbrev = "";
      let position = "";

      if (Array.isArray(metaArr)) {
        for (const m of metaArr) {
          const mObj = m as Record<string, unknown> | undefined;
          if (!mObj) continue;
          if (mObj.player_key) playerKey = String(mObj.player_key);
          if (mObj.full_name) name = String(mObj.full_name);
          // Team abbreviation
          if (mObj.editorial_team_abbr) teamAbbrev = String(mObj.editorial_team_abbr).toUpperCase();
          // Position
          if (mObj.primary_position) position = String(mObj.primary_position);
          if (mObj.display_position && !position) position = String(mObj.display_position);
          // Team data sometimes nested
          if (mObj.name && typeof mObj.name === "object") {
            const nameObj = mObj.name as Record<string, unknown>;
            if (nameObj.full) name = String(nameObj.full);
          }
        }
      }

      if (!playerKey) continue;

      // pArr[1] = stats object
      const statsData = pArr[1] as Record<string, unknown> | undefined;
      const playerStats = statsData?.player_stats as Record<string, unknown> | undefined;
      const statsArr = (playerStats?.stats as Record<string, unknown>)?.stat as unknown[];

      const rawStats: Record<number, number> = {};
      let gp = 0;

      if (Array.isArray(statsArr)) {
        for (const statEntry of statsArr) {
          const se = statEntry as Record<string, unknown>;
          const sid = Number(se.stat_id);
          if (isNaN(sid)) continue;

          const { value, attempted } = parseStatValue(se.value);

          if (sid === YAHOO_STAT.GP) {
            gp = value;
            rawStats[sid] = value;
          } else if (attempted !== undefined) {
            // Fraction format (e.g. FG% = "168/352") → store [made, attempted] separately
            // FGM is stat 5, FGA is synthetic stat 6
            // FTM is stat 8, FTA is synthetic stat 9
            // These synthetic IDs match the YAHOO_STAT constants
            rawStats[sid] = value;          // made
            rawStats[sid + 1] = attempted;  // attempted (synthetic ID = sid+1)
          } else {
            rawStats[sid] = value;
          }
        }
      }

      // Extract GP from stats if not found directly (GP stat_id=0)
      if (gp === 0 && rawStats[YAHOO_STAT.GP]) {
        gp = rawStats[YAHOO_STAT.GP];
      }

      // Skip players with no stats at all
      if (gp === 0 && !Object.values(rawStats).some(v => v !== 0)) continue;

      results.push({ playerKey, name, teamAbbrev, position, rawStats, gp });
    }
  } catch {
    // ignore parse errors
  }

  return results;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const leagueKey   = searchParams.get("leagueKey");
  const window      = searchParams.get("window") ?? "season";
  const accessToken = req.headers.get("x-yahoo-access-token") ?? "";
  const b = req.headers.get("x-yahoo-b") ?? "";
  const t = req.headers.get("x-yahoo-t") ?? "";

  if (!leagueKey) {
    return NextResponse.json({ error: "Missing leagueKey" }, { status: 400 });
  }
  if (!accessToken && !b) {
    return NextResponse.json(
      { error: "Not connected to Yahoo. Sign in via Settings → Yahoo." },
      { status: 401 }
    );
  }

  const statType = WINDOW_TO_STAT_TYPE[window] ?? "season";

  // Step 1: Fetch teams with rosters to get all player_keys
  const teamsUrl = `${YAHOO_API_BASE}/league/${leagueKey}/teams;out=roster?format=json`;
  let playerKeys: string[] = [];

  try {
    const res = await yahooFetch(teamsUrl, accessToken, b, t);
    if (!res.ok) {
      const body = await res.text();
      if (res.status === 401 || res.status === 403) {
        return NextResponse.json(
          { error: "Yahoo credentials rejected. Try reconnecting via Quick Connect in Settings." },
          { status: res.status }
        );
      }
      return NextResponse.json(
        { error: `Yahoo returned ${res.status}`, detail: body.slice(0, 300) },
        { status: res.status }
      );
    }
    const text = await res.text();
    const data = JSON.parse(text);
    playerKeys = extractPlayerKeysFromRoster(data);
  } catch (err) {
    return NextResponse.json(
      { error: "Network error fetching Yahoo roster", detail: String(err) },
      { status: 502 }
    );
  }

  if (playerKeys.length === 0) {
    return NextResponse.json([]);
  }

  // Step 2: Fetch player stats in batches of MAX_PLAYERS_PER_REQUEST
  const allPlayers: Array<{
    playerKey: string;
    name: string;
    teamAbbrev: string;
    position: string;
    rawStats: Record<number, number>;
    gp: number;
  }> = [];

  for (let i = 0; i < playerKeys.length; i += MAX_PLAYERS_PER_REQUEST) {
    const batch = playerKeys.slice(i, i + MAX_PLAYERS_PER_REQUEST);
    const keysParam = batch.join(",");
    const statsUrl = `${YAHOO_API_BASE}/players;player_keys=${keysParam};out=stats?stat_type=${statType}&format=json`;

    try {
      const res = await yahooFetch(statsUrl, accessToken, b, t);
      if (!res.ok) continue; // skip failed batches — still return other data

      const text = await res.text();
      const data = JSON.parse(text);
      const parsed = parsePlayersWithStats(data);
      allPlayers.push(...parsed);
    } catch {
      // skip failed batch
    }
  }

  // Normalize to PlayerStats shape (compatible with aggregateStats/calcTradeScore)
  // playerId: extract numeric ID from player_key (e.g. "428.p.6014" → 6014)
  const normalized = allPlayers.map(p => {
    const idMatch = p.playerKey.match(/\.p\.(\d+)$/);
    const playerId = idMatch ? Number(idMatch[1]) : 0;

    const rs = p.rawStats;
    return {
      playerId,
      playerName: p.name,
      teamAbbrev: p.teamAbbrev,
      position: p.position,
      pts:     rs[YAHOO_STAT.PTS]  ?? 0,
      reb:     rs[YAHOO_STAT.REB]  ?? 0,
      ast:     rs[YAHOO_STAT.AST]  ?? 0,
      stl:     rs[YAHOO_STAT.STL]  ?? 0,
      blk:     rs[YAHOO_STAT.BLK]  ?? 0,
      to:      rs[YAHOO_STAT.TO]   ?? 0,
      threepm: rs[YAHOO_STAT.TPM]  ?? 0,
      fgm:     rs[YAHOO_STAT.FGM]  ?? 0,
      fga:     rs[YAHOO_STAT.FGA]  ?? 0,
      ftm:     rs[YAHOO_STAT.FTM]  ?? 0,
      fta:     rs[YAHOO_STAT.FTA]  ?? 0,
      threepa: rs[YAHOO_STAT.TPA]  ?? 0,
      gp:      p.gp,
      rawStats: rs,
    };
  });

  return NextResponse.json(normalized);
}
