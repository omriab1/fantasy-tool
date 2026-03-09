import { NextRequest, NextResponse } from "next/server";
import { SPORT_CONFIGS, apiBase, apiSegment } from "@/lib/sports-config";
import type { EspnSport } from "@/lib/types";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const leagueId = searchParams.get("leagueId");
  const window = searchParams.get("window") ?? "season";
  const sport = (searchParams.get("sport") ?? "fba") as EspnSport;
  const cfg = SPORT_CONFIGS[sport] ?? SPORT_CONFIGS.fba;
  const espnS2 = req.headers.get("x-espn-s2") ?? "";
  const swid = req.headers.get("x-espn-swid") ?? "";

  if (!leagueId) {
    return NextResponse.json({ error: "Missing leagueId" }, { status: 400 });
  }

  // ESPN stat window filter headers.
  // The season filter's additionalValue uses ESPN season-code format: "00{year}" and "10{year}".
  // statsFallbackYear: for sports in off-season (e.g. WNBA), stats live under the prior year.
  const y = cfg.seasonYear;
  const statsY = cfg.statsFallbackYear ?? y;
  const WINDOW_FILTERS: Record<string, object> = {
    // Include "10{y}" (current-year projections) even when statsFallbackYear is set so that
    // projections are returned alongside actual stats in a single fetch and cached correctly.
    season: {
      filterStatsForTopScoringPeriodIds: { value: 3, additionalValue: [`00${statsY}`, `10${y}`, `00${statsY - 1}`] },
    },
    "30": { filterStatsForTopScoringPeriodIds: { value: 30 } },
    "15": { filterStatsForTopScoringPeriodIds: { value: 15 } },
    "7": { filterStatsForTopScoringPeriodIds: { value: 7 } },
    // Projections: statSourceId=1 entries — "10{year}" is the ESPN projection season code.
    // Use the current season year (y) for projections even when statsFallbackYear is set
    // (e.g. MLB off-season: actual stats are 2025 but 2026 projections use "102026").
    proj: {
      filterStatsForTopScoringPeriodIds: { value: 2, additionalValue: [`10${y}`, `00${statsY}`] },
    },
  };

  const filter = WINDOW_FILTERS[window] ?? WINDOW_FILTERS["season"];
  const filterHeader = JSON.stringify({ players: filter });

  const base = `${apiBase(cfg)}/games/${apiSegment(cfg)}/seasons/${cfg.seasonYear}/segments/0/leagues`;
  const url = `${base}/${leagueId}/players?scoringPeriodId=0&view=kona_player_info`;

  try {
    const res = await fetch(url, {
      headers: {
        Cookie: `espn_s2=${espnS2}; SWID=${swid}`,
        "X-Fantasy-Filter": filterHeader,
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

    const text = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: "ESPN returned a non-JSON page (bad credentials or wrong league ID)", detail: text.slice(0, 400) },
        { status: 502 }
      );
    }
    // Normalize: some ESPN endpoints (e.g. NHL) wrap the player array as { players: [...] }
    // while others (e.g. NBA) return a bare array. Always return an array to the client.
    const raw = data as Record<string, unknown> | unknown[];
    const playersArr = Array.isArray(raw)
      ? raw
      : Array.isArray((raw as Record<string, unknown>).players)
        ? (raw as Record<string, unknown>).players
        : [];
    return NextResponse.json(playersArr);
  } catch (err) {
    return NextResponse.json({ error: "Network error reaching ESPN", detail: String(err) }, { status: 502 });
  }
}
