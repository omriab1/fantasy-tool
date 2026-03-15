/**
 * Yahoo Matchup Planner endpoint.
 *
 * GET /api/yahoo/matchup?leagueKey=428.l.19877
 *
 * Headers:
 *   x-yahoo-access-token — OAuth access token (preferred)
 *   x-yahoo-b            — B cookie (fallback)
 *   x-yahoo-t            — T cookie (fallback)
 *   x-yahoo-guid         — User's Yahoo GUID (stored from /users;use_login=1)
 *
 * Returns MatchupApiResponse:
 *   - My team + opponent identity/names
 *   - Game counts per NBA team abbreviation (total and remaining) for the current week
 *   - Current cumulative stats for both teams
 *
 * Data flow:
 *   1. Yahoo /league/{key}?out=scoreboard → opponent + current week stats
 *   2. ESPN public scoreboard for each day in the matchup week → schedule
 *   3. Map counts: NBA abbrev → games in week / remaining games
 */

import { NextRequest, NextResponse } from "next/server";
import { NBA_ABBREV_TO_ESPN_ID } from "@/lib/nba-schedule";
import type { MatchupApiResponse } from "@/lib/matchup-calculator";

const YAHOO_API_BASE = "https://fantasysports.yahooapis.com/fantasy/v2";

// ─── Yahoo fetch helper ───────────────────────────────────────────────────────

async function yahooFetch(url: string, accessToken: string, b: string, t: string) {
  const headers: Record<string, string> = { "Accept": "application/json" };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  } else {
    headers["Cookie"] = `B=${b}; T=${t}`;
    headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    headers["Referer"] = "https://basketball.fantasysports.yahoo.com/";
    headers["Origin"] = "https://basketball.fantasysports.yahoo.com";
  }
  return fetch(url, { headers, cache: "no-store" });
}

// ─── ESPN public scoreboard (no auth) ────────────────────────────────────────

async function fetchEspnScoreboardForDate(dateStr: string): Promise<string[]> {
  // Returns array of team abbreviations that play on this date
  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateStr}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json() as Record<string, unknown>;
    const events = (data.events as unknown[]) ?? [];
    const abbrevs: string[] = [];
    for (const ev of events) {
      const event = ev as Record<string, unknown>;
      const competitions = (event.competitions as unknown[]) ?? [];
      for (const comp of competitions) {
        const competition = comp as Record<string, unknown>;
        const competitors = (competition.competitors as unknown[]) ?? [];
        for (const competitor of competitors) {
          const c = competitor as Record<string, unknown>;
          const team = c.team as Record<string, unknown> | undefined;
          const abbr = team?.abbreviation as string | undefined;
          if (abbr) abbrevs.push(abbr.toUpperCase());
        }
      }
    }
    return abbrevs;
  } catch {
    return [];
  }
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function dateToYYYYMMDD(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

function getDatesInRange(startStr: string, endStr: string): Date[] {
  // startStr / endStr: "2025-01-06" format
  const start = new Date(startStr + "T00:00:00Z");
  const end = new Date(endStr + "T00:00:00Z");
  const dates: Date[] = [];
  let cur = start;
  while (cur <= end) {
    dates.push(cur);
    cur = addDays(cur, 1);
  }
  return dates;
}

// ─── Yahoo scoreboard parsing ─────────────────────────────────────────────────

function parseYahooScoreboard(scoreboardData: unknown, userGuid: string): {
  myTeamId: number;
  myTeamName: string;
  opponentTeamId: number | null;
  opponentTeamName: string | null;
  currentWeek: number;
  weekStart: string;
  weekEnd: string;
  myCurrentStats: Record<string, number>;
  oppCurrentStats: Record<string, number>;
} | null {
  // Navigate: { fantasy_content: { league: [metadata, { scoreboard: {...} }] } }
  const raw = scoreboardData as Record<string, unknown> | undefined;
  const fc = raw?.fantasy_content as Record<string, unknown> | undefined;
  const leagueArr = fc?.league as unknown[];
  if (!Array.isArray(leagueArr) || leagueArr.length < 2) return null;

  const leagueMeta = leagueArr[0] as Record<string, unknown>;
  const currentWeek = Number(leagueMeta?.current_week ?? 1);
  const weekStart = String(leagueMeta?.start_date ?? "");
  const weekEnd = String(leagueMeta?.end_date ?? "");

  const leagueContent = leagueArr[1] as Record<string, unknown>;
  const scoreboardObj = leagueContent?.scoreboard as Record<string, unknown> | undefined;
  const matchupsObj = scoreboardObj?.matchups as Record<string, unknown> | undefined;

  if (!matchupsObj) return null;

  const matchupCount = Number(matchupsObj.count ?? 0);
  for (let i = 0; i < matchupCount; i++) {
    const matchupEntry = matchupsObj[String(i)] as Record<string, unknown> | undefined;
    const matchup = matchupEntry?.matchup as Record<string, unknown> | undefined;
    if (!matchup) continue;

    // Each matchup has teams_0 and teams_1
    const teams = matchup.teams as Record<string, unknown> | undefined;
    if (!teams) continue;

    const team0 = (teams["0"] as Record<string, unknown>)?.team as unknown[];
    const team1 = (teams["1"] as Record<string, unknown>)?.team as unknown[];

    function parseTeam(teamArr: unknown[]): { id: number; name: string; guid: string; stats: Record<string, number> } | null {
      if (!Array.isArray(teamArr) || teamArr.length === 0) return null;
      const metaArr = teamArr[0] as unknown[];
      let id = 0;
      let name = "";
      let guid = "";

      if (Array.isArray(metaArr)) {
        for (const m of metaArr) {
          const mObj = m as Record<string, unknown> | undefined;
          if (!mObj) continue;
          if (mObj.team_id !== undefined) id = Number(mObj.team_id);
          if (mObj.name) name = String(mObj.name);
          if (mObj.managers) {
            const mgrs = (mObj.managers as Record<string, unknown>)?.manager;
            const mgr = Array.isArray(mgrs) ? mgrs[0] : mgrs;
            if (mgr) guid = String((mgr as Record<string, unknown>).guid ?? "").toLowerCase();
          }
        }
      }
      // Stats from team_stats
      const statsArr = teamArr[1] as Record<string, unknown> | undefined;
      const teamStats = statsArr?.team_stats as Record<string, unknown> | undefined;
      const statsObj = teamStats?.stats as Record<string, unknown> | undefined;
      const statsRecord: Record<string, number> = {};
      if (statsObj) {
        const count = Number(statsObj.count ?? 0);
        for (let k = 0; k < count; k++) {
          const statEntry = statsObj[String(k)] as Record<string, unknown> | undefined;
          const stat = statEntry?.stat as Record<string, unknown> | undefined;
          if (stat?.stat_id !== undefined && stat?.value !== undefined) {
            statsRecord[String(stat.stat_id)] = Number(stat.value);
          }
        }
      }
      return { id, name, guid, stats: statsRecord };
    }

    const t0 = parseTeam(team0);
    const t1 = parseTeam(team1);
    if (!t0 || !t1) continue;

    const guidLower = userGuid.toLowerCase();
    let myTeam: typeof t0;
    let oppTeam: typeof t1;

    if (t0.guid === guidLower) {
      myTeam = t0; oppTeam = t1;
    } else if (t1.guid === guidLower) {
      myTeam = t1; oppTeam = t0;
    } else {
      continue;
    }

    return {
      myTeamId: myTeam.id,
      myTeamName: myTeam.name,
      opponentTeamId: oppTeam.id,
      opponentTeamName: oppTeam.name,
      currentWeek,
      weekStart,
      weekEnd,
      myCurrentStats: myTeam.stats,
      oppCurrentStats: oppTeam.stats,
    };
  }

  return null;
}

// ─── Fetch user GUID ──────────────────────────────────────────────────────────

async function fetchYahooGuid(accessToken: string, b: string, t: string): Promise<string> {
  try {
    const res = await yahooFetch(
      "https://fantasysports.yahooapis.com/fantasy/v2/users;use_login=1?format=json",
      accessToken, b, t,
    );
    if (!res.ok) return "";
    const data = await res.json() as Record<string, unknown>;
    const fc = data.fantasy_content as Record<string, unknown> | undefined;
    const users = fc?.users as Record<string, unknown> | undefined;
    const user0 = users?.["0"] as Record<string, unknown> | undefined;
    const userArr = user0?.user as unknown[];
    if (!Array.isArray(userArr) || userArr.length === 0) return "";
    const meta = userArr[0] as Record<string, unknown>;
    return String(meta?.guid ?? "").toLowerCase();
  } catch {
    return "";
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const leagueKey = searchParams.get("leagueKey");

  if (!leagueKey) {
    return NextResponse.json({ error: "Missing leagueKey" }, { status: 400 });
  }

  const accessToken = req.headers.get("x-yahoo-access-token") ?? "";
  const b = req.headers.get("x-yahoo-b") ?? "";
  const t = req.headers.get("x-yahoo-t") ?? "";
  // GUID can be pre-stored (passed as header) or fetched on-the-fly
  let guid = req.headers.get("x-yahoo-guid") ?? "";

  if (!accessToken && !b) {
    return NextResponse.json(
      { error: "Not connected to Yahoo. Sign in via Settings → Yahoo." },
      { status: 401 },
    );
  }

  // Fetch GUID if not provided — needed to identify user's team in the scoreboard
  if (!guid) {
    guid = await fetchYahooGuid(accessToken, b, t);
  }

  if (!guid) {
    return NextResponse.json(
      { error: "Could not determine your Yahoo user identity. Try reconnecting in Settings." },
      { status: 422 },
    );
  }

  // ── Step 1: Fetch Yahoo scoreboard for this league ────────────────────────
  const scoreboardUrl = `${YAHOO_API_BASE}/league/${leagueKey}?format=json&out=scoreboard`;
  let scoreboardData: unknown;
  try {
    const res = await yahooFetch(scoreboardUrl, accessToken, b, t);
    if (!res.ok) {
      const body = await res.text();
      if (res.status === 401 || res.status === 403) {
        return NextResponse.json(
          { error: "Yahoo credentials rejected. Try reconnecting via Quick Connect in Settings." },
          { status: res.status },
        );
      }
      return NextResponse.json(
        { error: `Yahoo returned ${res.status}`, detail: body.slice(0, 200) },
        { status: res.status },
      );
    }
    scoreboardData = await res.json();
  } catch (err) {
    return NextResponse.json({ error: "Network error reaching Yahoo", detail: String(err) }, { status: 502 });
  }

  // ── Step 2: Parse scoreboard to find my matchup ───────────────────────────
  const parsed = parseYahooScoreboard(scoreboardData, guid);
  if (!parsed) {
    const hint = !guid
      ? " Make sure your Yahoo GUID is saved in Settings (Quick Connect stores it automatically)."
      : "";
    return NextResponse.json(
      { error: `Could not find your current matchup in the Yahoo scoreboard.${hint}` },
      { status: 422 },
    );
  }

  const {
    myTeamId, myTeamName,
    opponentTeamId, opponentTeamName,
    currentWeek, weekStart, weekEnd,
    myCurrentStats, oppCurrentStats,
  } = parsed;

  // ── Step 3: Fetch NBA game schedule for each day in the matchup week ──────
  // weekStart/weekEnd come from Yahoo in "YYYY-MM-DD" format
  const weekDates = (weekStart && weekEnd) ? getDatesInRange(weekStart, weekEnd) : [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Fetch all days in parallel
  const scheduleByDay = await Promise.all(
    weekDates.map(async (date) => {
      const dateStr = dateToYYYYMMDD(date);
      const abbrevs = await fetchEspnScoreboardForDate(dateStr);
      return { date, abbrevs };
    }),
  );

  // Build game count maps: Yahoo team abbrev → game count
  const gamesInWeek: Record<string, number> = {};
  const gamesRemaining: Record<string, number> = {};

  // Initialize all known teams to 0
  for (const abbrev of Object.keys(NBA_ABBREV_TO_ESPN_ID)) {
    gamesInWeek[abbrev] = 0;
    gamesRemaining[abbrev] = 0;
  }

  for (const { date, abbrevs } of scheduleByDay) {
    const isFuture = date >= today;
    for (const abbrev of abbrevs) {
      if (abbrev in gamesInWeek) {
        gamesInWeek[abbrev]++;
        if (isFuture) gamesRemaining[abbrev]++;
      }
    }
  }

  // ── Build response ────────────────────────────────────────────────────────
  const response: MatchupApiResponse = {
    myTeamId,
    myTeamName,
    opponentTeamId,
    opponentTeamName,
    matchupPeriodId: currentWeek,
    currentMatchupPeriodId: currentWeek,
    totalMatchupPeriods: currentWeek,
    gamesInWeek,
    gamesRemaining,
    daysRemaining: weekDates.filter((d) => d >= today).length,
    myCurrentStats,
    oppCurrentStats,
    teamCurrentStats: {
      ...(myTeamId ? { [myTeamId]: myCurrentStats } : {}),
      ...(opponentTeamId != null ? { [opponentTeamId]: oppCurrentStats } : {}),
    },
    rosterByTeamId: {},
  };

  return NextResponse.json(response);
}
