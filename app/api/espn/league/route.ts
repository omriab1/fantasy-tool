import { NextRequest, NextResponse } from "next/server";
import { SPORT_CONFIGS, apiBase, apiSegment } from "@/lib/sports-config";
import type { EspnSport } from "@/lib/types";

async function fetchLeague(url: string, espnS2: string, swid: string) {
  return fetch(url, {
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
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const leagueId = searchParams.get("leagueId");
  const sport = (searchParams.get("sport") ?? "fba") as EspnSport;
  const cfg = SPORT_CONFIGS[sport] ?? SPORT_CONFIGS.fba;
  const espnS2 = req.headers.get("x-espn-s2") ?? "";
  const swid = req.headers.get("x-espn-swid") ?? "";

  if (!leagueId) {
    return NextResponse.json({ error: "Missing leagueId" }, { status: 400 });
  }

  const includeSchedule = searchParams.get("schedule") === "1";

  const base = `${apiBase(cfg)}/games/${apiSegment(cfg)}/seasons`;
  const views =
    "?view=mTeam&view=mSettings&view=mStatus&view=mRoster" +
    (includeSchedule ? "&view=proTeamSchedules" : "");

  // Try primary season year first; if 404, try statsFallbackYear (e.g. WNBA off-season)
  const yearsToTry: number[] = [cfg.seasonYear];
  if (cfg.statsFallbackYear && cfg.statsFallbackYear !== cfg.seasonYear) {
    yearsToTry.push(cfg.statsFallbackYear);
  }

  let lastUrl = "";
  let lastStatus = 0;
  let lastBody = "";

  for (const year of yearsToTry) {
    const url = `${base}/${year}/segments/0/leagues/${leagueId}${views}`;
    lastUrl = url;

    try {
      const res = await fetchLeague(url, espnS2, swid);
      lastStatus = res.status;

      if (res.ok) {
        const text = await res.text();
        let data: unknown;
        try {
          data = JSON.parse(text);
        } catch {
          return NextResponse.json(
            { error: "ESPN returned a non-JSON page (bad credentials or wrong league ID)", detail: text.slice(0, 400), url },
            { status: 502 }
          );
        }
        return NextResponse.json(data);
      }

      lastBody = await res.text();

      // Only retry on 404 — other errors (401, 403, 5xx) are definitive
      if (res.status !== 404) break;

    } catch (err) {
      return NextResponse.json({ error: "Network error reaching ESPN", detail: String(err), url }, { status: 502 });
    }
  }

  // All years failed
  const detail = lastBody.slice(0, 300);
  if (lastStatus === 401 || lastStatus === 403) {
    return NextResponse.json(
      { error: "Credentials rejected by ESPN. Try refreshing your espn_s2 cookie.", detail, url: lastUrl },
      { status: lastStatus }
    );
  }
  if (lastStatus === 404) {
    return NextResponse.json(
      { error: "Could not load league. Check that your League ID is correct.", detail, url: lastUrl },
      { status: 404 }
    );
  }
  return NextResponse.json(
    { error: `ESPN returned ${lastStatus}`, detail, url: lastUrl },
    { status: lastStatus }
  );
}
