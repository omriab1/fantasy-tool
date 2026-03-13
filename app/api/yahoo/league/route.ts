/**
 * Yahoo Fantasy League proxy.
 *
 * GET /api/yahoo/league?leagueKey=428.l.19877
 *
 * Headers:
 *   x-yahoo-b  — Yahoo B cookie (main session)
 *   x-yahoo-t  — Yahoo T cookie (login token)
 *
 * Fetches Yahoo Fantasy API for league metadata + team rosters, returns the
 * raw Yahoo JSON so the client hook (useYahooLeague) can parse it.
 *
 * Yahoo API endpoints used:
 *   1. League settings + metadata:
 *      GET /fantasy/v2/league/{leagueKey}?format=json&out=settings,standings,scoreboard
 *   2. Teams with rosters:
 *      GET /fantasy/v2/league/{leagueKey}/teams;out=roster?format=json
 *
 * Returns both responses merged under { league, teams } for the hook to parse.
 */

import { NextRequest, NextResponse } from "next/server";

const YAHOO_API_BASE = "https://fantasysports.yahooapis.com/fantasy/v2";

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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const leagueKey   = searchParams.get("leagueKey");
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

  // Fetch 1: League settings + metadata
  const leagueUrl = `${YAHOO_API_BASE}/league/${leagueKey}?format=json&out=settings,standings,scoreboard`;
  let leagueData: unknown;

  try {
    const res = await yahooFetch(leagueUrl, accessToken, b, t);

    if (!res.ok) {
      const body = await res.text();
      if (res.status === 401 || res.status === 403) {
        return NextResponse.json(
          {
            error: "Yahoo credentials rejected. Try reconnecting via Quick Connect in Settings.",
            detail: body.slice(0, 300),
          },
          { status: res.status }
        );
      }
      if (res.status === 404) {
        return NextResponse.json(
          { error: "Yahoo league not found. Check your league key." },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: `Yahoo returned ${res.status}`, detail: body.slice(0, 300) },
        { status: res.status }
      );
    }

    const text = await res.text();
    try {
      leagueData = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: "Yahoo returned a non-JSON response (bad credentials?)", detail: text.slice(0, 400) },
        { status: 502 }
      );
    }
  } catch (err) {
    return NextResponse.json(
      { error: "Network error reaching Yahoo", detail: String(err) },
      { status: 502 }
    );
  }

  // Fetch 2: Teams with rosters
  const teamsUrl = `${YAHOO_API_BASE}/league/${leagueKey}/teams;out=roster?format=json`;
  let teamsData: unknown;

  try {
    const res = await yahooFetch(teamsUrl, accessToken, b, t);
    if (res.ok) {
      const text = await res.text();
      try {
        teamsData = JSON.parse(text);
      } catch {
        teamsData = null;
      }
    }
  } catch {
    teamsData = null;
  }

  return NextResponse.json({ league: leagueData, teams: teamsData });
}
