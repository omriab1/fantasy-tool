import { NextRequest, NextResponse } from "next/server";

const ESPN_BASE = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons/2026/segments/0/leagues";

const HEADERS = (s2: string, swid: string) => ({
  Cookie: `espn_s2=${s2}; SWID=${swid}`,
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json",
  "Referer": "https://fantasy.espn.com/",
  "Origin": "https://fantasy.espn.com",
  "x-fantasy-source": "kona",
  "x-fantasy-platform": "kona-PROD-2.7.0-rc-14-p2",
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const leagueId = searchParams.get("leagueId");
    const espnS2 = searchParams.get("s2") ?? req.headers.get("x-espn-s2") ?? "";
    const swid = searchParams.get("swid") ?? req.headers.get("x-espn-swid") ?? "";
    const period = searchParams.get("period") ?? "17";

    if (!leagueId) return NextResponse.json({ error: "Missing leagueId" }, { status: 400 });

    // Use mMatchup view — returns full-season schedule with per-category scoreByStat
    const url = `${ESPN_BASE}/${leagueId}?scoringPeriodId=${period}&view=mMatchup`;

    const res = await fetch(url, { headers: HEADERS(espnS2, swid), cache: "no-store" });
    const text = await res.text();

    if (!res.ok) {
      return NextResponse.json({ error: `ESPN returned ${res.status}`, preview: text.slice(0, 500) }, { status: res.status });
    }

    let data: Record<string, unknown>;
    try { data = JSON.parse(text); }
    catch { return NextResponse.json({ error: "Non-JSON from ESPN", preview: text.slice(0, 300) }); }

    const schedule = (data.schedule as unknown[]) ?? [];
    const allPeriods = [...new Set(schedule.map((m) => (m as Record<string, unknown>).matchupPeriodId as number))].sort((a, b) => a - b);

    // Grab first matchup and show scoreByStat structure
    const firstMatchup = schedule[0] as Record<string, unknown> | undefined;
    const homeData = firstMatchup?.home as Record<string, unknown> | undefined;
    const cs = homeData?.cumulativeScore as Record<string, unknown> | undefined;
    const sbs = cs?.scoreByStat as Record<string, unknown> | null | undefined;

    // Also show a specific period's data
    const reqPeriodMatchups = schedule.filter((m) => (m as Record<string, unknown>).matchupPeriodId === Number(period));
    const reqFirstHome = (reqPeriodMatchups[0] as Record<string, unknown> | undefined)?.home as Record<string, unknown> | undefined;
    const reqSbs = (reqFirstHome?.cumulativeScore as Record<string, unknown> | undefined)?.scoreByStat;

    return NextResponse.json({
      requestedPeriod: Number(period),
      topLevelKeys: Object.keys(data),
      scoringPeriodId: data.scoringPeriodId,
      scheduleMatchupCount: schedule.length,
      allMatchupPeriods: allPeriods,

      firstMatchup: {
        matchupPeriodId: firstMatchup?.matchupPeriodId,
        homeTeamId: homeData?.teamId,
        homeKeys: homeData ? Object.keys(homeData) : null,
        cumulativeScoreKeys: cs ? Object.keys(cs) : null,
        scoreByStat: sbs ?? null,
      },

      requestedPeriodMatchup: {
        count: reqPeriodMatchups.length,
        homeTeamId: reqFirstHome?.teamId,
        scoreByStat: reqSbs ?? null,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: "Unexpected error", detail: String(err) }, { status: 500 });
  }
}
