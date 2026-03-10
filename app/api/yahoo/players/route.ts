/**
 * Yahoo Fantasy Players proxy.
 *
 * GET /api/yahoo/players?leagueKey=466.l.375776&window=season
 *
 * Two-step approach (more reliable than out=stats on league endpoint):
 *   Step 1: GET /league/{key}/players;sort=AR;count=25;start={n}?format=json
 *           → paginate to collect all player_keys (up to MAX_TOTAL_PLAYERS)
 *   Step 2: GET /players;player_keys={p1,p2,...};out=stats?stat_type={type}&format=json
 *           → batch-fetch stats for collected keys (25 per request)
 *
 * Window → Yahoo stat_type mapping:
 *   season → "season_stats"
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
  season:  "season_stats",
  "30":    "lastmonth",
  "14":    "last14days",
  "7":     "lastweek",
  proj:    "season_stats",
};

async function yahooFetch(url: string, accessToken: string, b: string, t: string) {
  const headers: Record<string, string> = { "Accept": "application/json" };
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
 * Extract player keys + metadata from a league players list response.
 * Response: fantasy_content.league[1].players.{n}.player[0] = metadata array
 */
function extractLeaguePlayers(data: unknown): Array<{ key: string; name: string; teamAbbrev: string; position: string; imageUrl: string }> {
  const results: Array<{ key: string; name: string; teamAbbrev: string; position: string; imageUrl: string }> = [];
  try {
    const fc = (data as Record<string, unknown>)?.fantasy_content as Record<string, unknown>;
    const league = fc?.league as unknown[];
    if (!Array.isArray(league) || league.length < 2) return results;
    const leagueData = league[1] as Record<string, unknown>;
    const playersObj = leagueData?.players as Record<string, unknown>;
    if (!playersObj) return results;

    const count = Number(playersObj.count ?? 0);
    for (let i = 0; i < count; i++) {
      const pEntry = playersObj[String(i)] as Record<string, unknown> | undefined;
      const pArr = pEntry?.player as unknown[];
      if (!Array.isArray(pArr) || pArr.length < 1) continue;

      const metaArr = pArr[0] as unknown[];
      if (!Array.isArray(metaArr)) continue;

      let key = "", name = "Unknown", teamAbbrev = "", position = "", imageUrl = "";
      for (const m of metaArr) {
        const mObj = m as Record<string, unknown> | undefined;
        if (!mObj) continue;
        if (mObj.player_key) key = String(mObj.player_key);
        if (mObj.full_name) name = String(mObj.full_name);
        if (mObj.editorial_team_abbr) teamAbbrev = String(mObj.editorial_team_abbr).toUpperCase();
        if (mObj.display_position) position = String(mObj.display_position);
        else if (mObj.primary_position && !position) position = String(mObj.primary_position);
        if (mObj.image_url) imageUrl = String(mObj.image_url);
        if (mObj.name && typeof mObj.name === "object") {
          const n = mObj.name as Record<string, unknown>;
          if (n.full) name = String(n.full);
        }
      }
      if (key) results.push({ key, name, teamAbbrev, position, imageUrl });
    }
  } catch { /* ignore */ }
  return results;
}

/**
 * Parse stats from /players;player_keys={keys};out=stats response.
 * Response: fantasy_content.players.{n}.player[0] = metadata, player[1] = stats
 */
function parseStatsResponse(data: unknown): Map<string, { rawStats: Record<number, number>; gp: number }> {
  const result = new Map<string, { rawStats: Record<number, number>; gp: number }>();
  try {
    const fc = (data as Record<string, unknown>)?.fantasy_content as Record<string, unknown>;
    const playersObj = fc?.players as Record<string, unknown>;
    if (!playersObj) return result;

    const count = Number(playersObj.count ?? 0);
    for (let i = 0; i < count; i++) {
      const pEntry = playersObj[String(i)] as Record<string, unknown> | undefined;
      const pArr = pEntry?.player as unknown[];
      if (!Array.isArray(pArr) || pArr.length < 2) continue;

      // Get player_key from metadata
      const metaArr = pArr[0] as unknown[];
      let playerKey = "";
      if (Array.isArray(metaArr)) {
        for (const m of metaArr) {
          const mObj = m as Record<string, unknown> | undefined;
          if (mObj?.player_key) { playerKey = String(mObj.player_key); break; }
        }
      }
      if (!playerKey) continue;

      // Parse stats from player[1]
      const statsData   = pArr[1] as Record<string, unknown> | undefined;
      const playerStats = statsData?.player_stats as Record<string, unknown> | undefined;
      const statsArr    = (playerStats?.stats as Record<string, unknown>)?.stat as unknown[];

      const rawStats: Record<number, number> = {};
      let gp = 0;

      if (Array.isArray(statsArr)) {
        for (const statEntry of statsArr) {
          const se  = statEntry as Record<string, unknown>;
          const sid = Number(se.stat_id);
          if (isNaN(sid)) continue;
          const { value, attempted } = parseStatValue(se.value);
          if (sid === YAHOO_STAT.GP) {
            gp = value; rawStats[sid] = value;
          } else if (attempted !== undefined) {
            rawStats[sid]     = value;
            rawStats[sid + 1] = attempted;
          } else {
            rawStats[sid] = value;
          }
        }
      }
      if (gp === 0 && rawStats[YAHOO_STAT.GP]) gp = rawStats[YAHOO_STAT.GP];
      result.set(playerKey, { rawStats, gp });
    }
  } catch { /* ignore */ }
  return result;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const leagueKey   = searchParams.get("leagueKey");
  const window      = searchParams.get("window") ?? "season";
  const debug       = searchParams.get("debug") === "1";
  const accessToken = req.headers.get("x-yahoo-access-token") ?? searchParams.get("token") ?? "";
  const b = req.headers.get("x-yahoo-b") ?? searchParams.get("b") ?? "";
  const t = req.headers.get("x-yahoo-t") ?? searchParams.get("t") ?? "";

  if (!leagueKey) return NextResponse.json({ error: "Missing leagueKey" }, { status: 400 });
  if (!accessToken && !b) {
    return NextResponse.json({ error: "Not connected to Yahoo. Sign in via Settings → Yahoo." }, { status: 401 });
  }

  const statType = WINDOW_TO_STAT_TYPE[window] ?? "season_stats";

  // ── Step 1: Collect all player keys + metadata ──────────────────────────────
  const leaguePlayers: Array<{ key: string; name: string; teamAbbrev: string; position: string; imageUrl: string }> = [];

  for (let start = 0; start < MAX_TOTAL_PLAYERS; start += PLAYERS_PER_PAGE) {
    const url = `${YAHOO_API_BASE}/league/${leagueKey}/players;sort=AR;count=${PLAYERS_PER_PAGE};start=${start}?format=json`;
    try {
      const res = await yahooFetch(url, accessToken, b, t);
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          return NextResponse.json({ error: "Yahoo credentials rejected. Try reconnecting via Quick Connect in Settings." }, { status: res.status });
        }
        if (start === 0) {
          const body = await res.text();
          return NextResponse.json({ error: `Yahoo returned ${res.status}`, detail: body.slice(0, 300) }, { status: res.status });
        }
        break;
      }
      const data = JSON.parse(await res.text());
      const page = extractLeaguePlayers(data);
      leaguePlayers.push(...page);
      if (page.length < PLAYERS_PER_PAGE) break;
    } catch (err) {
      if (start === 0) return NextResponse.json({ error: "Network error", detail: String(err) }, { status: 502 });
      break;
    }
  }

  if (debug) {
    return NextResponse.json({ step: "keys", totalKeys: leaguePlayers.length, sample: leaguePlayers.slice(0, 3) });
  }

  if (leaguePlayers.length === 0) return NextResponse.json([]);

  // ── Step 2: Batch-fetch stats for collected keys ─────────────────────────────
  const allStats = new Map<string, { rawStats: Record<number, number>; gp: number }>();
  const keys = leaguePlayers.map(p => p.key);
  const debugStep2 = searchParams.get("debug") === "2";

  for (let i = 0; i < keys.length; i += PLAYERS_PER_PAGE) {
    const batch = keys.slice(i, i + PLAYERS_PER_PAGE);
    const keysParam = batch.join(",");
    const url = `${YAHOO_API_BASE}/players;player_keys=${keysParam};out=stats?stat_type=${statType}&format=json`;
    try {
      const res = await yahooFetch(url, accessToken, b, t);
      if (debugStep2 && i === 0) {
        const raw = await res.text();
        let parsed: unknown;
        try { parsed = JSON.parse(raw); } catch { parsed = raw.slice(0, 500); }
        return NextResponse.json({ step: "stats", url, status: res.status, statType, raw: parsed });
      }
      if (!res.ok) continue;
      const data = JSON.parse(await res.text());
      const statsMap = parseStatsResponse(data);
      for (const [k, v] of statsMap) allStats.set(k, v);
    } catch { /* skip failed batch */ }
  }

  // ── Normalize to PlayerStats shape ──────────────────────────────────────────
  const normalized = leaguePlayers.map(p => {
    const stats = allStats.get(p.key) ?? { rawStats: {}, gp: 0 };
    const rs = stats.rawStats;
    const idMatch = p.key.match(/\.p\.(\d+)$/);
    const playerId = idMatch ? Number(idMatch[1]) : 0;
    return {
      playerId,
      playerName: p.name,
      teamAbbrev: p.teamAbbrev,
      position: p.position,
      headshotUrl: p.imageUrl || undefined,
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
      gp:      stats.gp,
      rawStats: rs,
    };
  });

  return NextResponse.json(normalized);
}
