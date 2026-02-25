import { NextRequest, NextResponse } from "next/server";

const ESPN_BASE = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons/2026/segments/0/leagues";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const leagueId = searchParams.get("leagueId");
  const period = searchParams.get("period");
  const espnS2 = req.headers.get("x-espn-s2") ?? "";
  const swid = req.headers.get("x-espn-swid") ?? "";

  if (!leagueId || !period) {
    return NextResponse.json({ error: "Missing leagueId or period" }, { status: 400 });
  }

  // mMatchup view returns full-season schedule with per-category scoreByStat for every team.
  // One call gets all historical matchup weeks — no need for one call per week.
  const url = `${ESPN_BASE}/${leagueId}?scoringPeriodId=${period}&view=mMatchup`;

  try {
    const res = await fetch(url, {
      headers: {
        Cookie: `espn_s2=${espnS2}; SWID=${swid}`,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://fantasy.espn.com/",
        "Origin": "https://fantasy.espn.com",
        "x-fantasy-source": "kona",
        "x-fantasy-platform": "kona-PROD-2.7.0-rc-14-p2",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `ESPN returned ${res.status}`, detail: text.slice(0, 200) },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: "Network error reaching ESPN", detail: String(err) }, { status: 502 });
  }
}
