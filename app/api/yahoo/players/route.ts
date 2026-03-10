/**
 * Yahoo Fantasy Players proxy.
 *
 * GET /api/yahoo/players?leagueKey=466.l.375776&window=season
 *
 * Fetches ALL players from the league's player pool (not just rostered),
 * sorted by average rank, paginated 25 at a time up to MAX_TOTAL_PLAYERS.
 * Works for both drafted and pre-draft leagues.
 *
 * Yahoo API:
 *   GET /league/{key}/players;sort=AR;count=25;start={n};out=stats?stat_type={type}&format=json
 *
 * Window → Yahoo stat_type mapping:
 *   season → "season"
 *   30     → "lastmonth"
 *   14     → "last14days"
 *   7      → "lastweek"
 */

import { NextRequest, NextResponse } from "next/server";
import { YAHOO_STAT } from "@/lib/yahoo-scoring-config";

const YAHOO_API_BASE = "https://fantasysports.yahooapis.com/fantasy/v2";
const PLAYERS_PER_PAGE = 25;
const MAX_TOTAL_PLAYERS = 300;

const WINDOW_TO_STAT_TYPE: Record<string, string> = {
  season:  "season",
  "30":    "lastmonth",
  "14":    "last14days",
  "7":     "lastweek",
  proj:    "season",
};

async function yahooFetch(url: string, accessToken: string, b: string, t: string) {
  const headers: Record<string, string> = {
    "Accept": "application/json",
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

function parseStatValue(value: unknown): { value: number; attempted?: number } {
  if (value === null || value === undefined || value === "-") return { value: 0 };
  const str = String(value).trim();
  if (str.includes("/")) {
    const [madeStr, attStr] = str.split("/");
    const made = parseFloat(madeStr ?? "0");
    const att  = parseFloat(attStr ?? "0");
    return { value: isNaN(made) ? 0 : made, attempted: isNaN(att) ? 0 : att };
  }
  const num = parseFloat(str);
  return { value: isNaN(num) ? 0 : num };
}

interface ParsedPlayer {
  playerKey: string;
  name: string;
  teamAbbrev: string;
  position: string;
  imageUrl: string;
  rawStats: Record<number, number>;
  gp: number;
}

/**
 * Parse a players array from a Yahoo response.
 * playersObj shape: { "0": { player: [metaArr, statsObj] }, count: N }
 */
function parsePlayersObj(playersObj: Record<string, unknown>): ParsedPlayer[] {
  const results: ParsedPlayer[] = [];
  const count = Number(playersObj.count ?? 0);

  for (let i = 0; i < count; i++) {
    const pEntry = playersObj[String(i)] as Record<string, unknown> | undefined;
    const pArr = pEntry?.player as unknown[];
    if (!Array.isArray(pArr) || pArr.length < 2) continue;

    const metaArr = pArr[0] as unknown[];
    let playerKey = "";
    let name = "Unknown";
    let teamAbbrev = "";
    let position = "";
    let imageUrl = "";

    if (Array.isArray(metaArr)) {
      for (const m of metaArr) {
        const mObj = m as Record<string, unknown> | undefined;
        if (!mObj) continue;
        if (mObj.player_key) playerKey = String(mObj.player_key);
        if (mObj.full_name) name = String(mObj.full_name);
        if (mObj.editorial_team_abbr) teamAbbrev = String(mObj.editorial_team_abbr).toUpperCase();
        // Prefer display_position (e.g. "PG,SG") over primary_position (e.g. "PG")
        if (mObj.display_position) position = String(mObj.display_position);
        else if (mObj.primary_position) position = String(mObj.primary_position);
        if (mObj.image_url) imageUrl = String(mObj.image_url);
        if (mObj.name && typeof mObj.name === "object") {
          const nameObj = mObj.name as Record<string, unknown>;
          if (nameObj.full) name = String(nameObj.full);
        }
      }
    }

    if (!playerKey) continue;

    const statsData  = pArr[1] as Record<string, unknown> | undefined;
    const playerStats = statsData?.player_stats as Record<string, unknown> | undefined;
    const statsArr   = (playerStats?.stats as Record<string, unknown>)?.stat as unknown[];

    const rawStats: Record<number, number> = {};
    let gp = 0;

    if (Array.isArray(statsArr)) {
      for (const statEntry of statsArr) {
        const se  = statEntry as Record<string, unknown>;
        const sid = Number(se.stat_id);
        if (isNaN(sid)) continue;

        const { value, attempted } = parseStatValue(se.value);

        if (sid === YAHOO_STAT.GP) {
          gp = value;
          rawStats[sid] = value;
        } else if (attempted !== undefined) {
          rawStats[sid]     = value;      // made
          rawStats[sid + 1] = attempted;  // attempted (synthetic ID = sid+1)
        } else {
          rawStats[sid] = value;
        }
      }
    }

    if (gp === 0 && rawStats[YAHOO_STAT.GP]) gp = rawStats[YAHOO_STAT.GP];

    results.push({ playerKey, name, teamAbbrev, position, imageUrl, rawStats, gp });
  }
  return results;
}

/**
 * Extract the players object from a league players response.
 * fantasy_content.league[1].players
 */
function extractPlayersObjFromLeagueResponse(data: unknown): Record<string, unknown> | null {
  try {
    const fc = (data as Record<string, unknown>)?.fantasy_content as Record<string, unknown>;
    const league = fc?.league as unknown[];
    if (!Array.isArray(league) || league.length < 2) return null;
    const leagueData = league[1] as Record<string, unknown>;
    return (leagueData?.players as Record<string, unknown>) ?? null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const leagueKey   = searchParams.get("leagueKey");
  const window      = searchParams.get("window") ?? "season";
  const debug       = searchParams.get("debug") === "1";
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
  const allPlayers: ParsedPlayer[] = [];
  const debugBatches: Array<{ start: number; status: number; parsed: number }> = [];

  for (let start = 0; start < MAX_TOTAL_PLAYERS; start += PLAYERS_PER_PAGE) {
    const url = `${YAHOO_API_BASE}/league/${leagueKey}/players;sort=AR;count=${PLAYERS_PER_PAGE};start=${start};out=stats?stat_type=${statType}&format=json`;

    try {
      const res = await yahooFetch(url, accessToken, b, t);

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          return NextResponse.json(
            { error: "Yahoo credentials rejected. Try reconnecting via Quick Connect in Settings." },
            { status: res.status }
          );
        }
        if (start === 0) {
          const body = await res.text();
          return NextResponse.json(
            { error: `Yahoo returned ${res.status}`, detail: body.slice(0, 300) },
            { status: res.status }
          );
        }
        break; // subsequent pages failing is OK — stop here
      }

      const data = JSON.parse(await res.text());
      const playersObj = extractPlayersObjFromLeagueResponse(data);
      if (!playersObj) break;

      const parsed = parsePlayersObj(playersObj);
      debugBatches.push({ start, status: res.status, parsed: parsed.length });
      allPlayers.push(...parsed);

      if (parsed.length < PLAYERS_PER_PAGE) break; // last page
    } catch (err) {
      if (start === 0) {
        return NextResponse.json(
          { error: "Network error fetching Yahoo players", detail: String(err) },
          { status: 502 }
        );
      }
      break;
    }
  }

  if (debug) {
    return NextResponse.json({ totalFetched: allPlayers.length, batches: debugBatches, sample: allPlayers.slice(0, 3) });
  }

  // Normalize to PlayerStats shape
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
      headshotUrl: p.imageUrl || undefined,
      rawStats: rs,
    };
  });

  return NextResponse.json(normalized);
}
