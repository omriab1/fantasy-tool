import { NextRequest, NextResponse } from "next/server";
import { SPORT_CONFIGS, apiBase } from "@/lib/sports-config";
import type { EspnSport } from "@/lib/types";

/**
 * Debug endpoint: shows the raw lineupSlotId values from ESPN's mRoster view.
 * Use this to verify that IR players (slot 21) are visible in the response.
 *
 * Usage: GET /api/espn/roster-debug?leagueId=XXX&sport=fba
 * Headers: x-espn-s2, x-espn-swid
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const leagueId = searchParams.get("leagueId");
  const sport = (searchParams.get("sport") ?? "fba") as EspnSport;
  const cfg = SPORT_CONFIGS[sport] ?? SPORT_CONFIGS.fba;
  // Accept credentials via URL params (for easy browser testing) or headers
  const espnS2 = searchParams.get("s2") ?? req.headers.get("x-espn-s2") ?? "";
  const swid = searchParams.get("swid") ?? req.headers.get("x-espn-swid") ?? "";

  if (!leagueId) {
    return NextResponse.json({ error: "Missing leagueId" }, { status: 400 });
  }

  const base = `${apiBase(cfg)}/games/${cfg.sport}/seasons/${cfg.seasonYear}/segments/0/leagues`;
  const url = `${base}/${leagueId}?view=mTeam&view=mRoster`;

  try {
    const res = await fetch(url, {
      headers: {
        Cookie: `espn_s2=${espnS2}; SWID=${swid}`,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
        "Referer": "https://fantasy.espn.com/",
        "Origin": "https://fantasy.espn.com",
        "x-fantasy-source": "kona",
        "x-fantasy-platform": "kona-PROD-2.7.0-rc-14-p2",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `ESPN returned ${res.status}`, detail: text.slice(0, 200) }, { status: res.status });
    }

    const data = await res.json() as Record<string, unknown>;
    const teams = (data.teams as unknown[]) ?? [];

    const result = teams.map((t: unknown) => {
      const team = t as Record<string, unknown>;
      const name = (team.name as string) || `Team ${team.id}`;
      const entries = ((team.roster as Record<string, unknown>)?.entries ?? []) as unknown[];

      // Collect the first few entries' full field names + lineupSlotId
      const sampleEntries = entries.slice(0, 20).map((e: unknown) => {
        const entry = e as Record<string, unknown>;
        return {
          fieldNames: Object.keys(entry),
          lineupSlotId: entry.lineupSlotId,
          playerId: entry.playerId,
          playerPoolEntryPlayerId: (entry.playerPoolEntry as Record<string, unknown> | undefined)?.playerId,
        };
      });

      // Count players per lineup slot
      const slotCounts: Record<number, number> = {};
      for (const e of entries) {
        const entry = e as Record<string, unknown>;
        const slotId = entry.lineupSlotId as number;
        slotCounts[slotId] = (slotCounts[slotId] ?? 0) + 1;
      }

      return { teamName: name, totalEntries: entries.length, slotCounts, sampleEntries };
    });

    return NextResponse.json({
      irSlotIdConfig: cfg.irSlotIds,
      teams: result,
    });
  } catch (err) {
    return NextResponse.json({ error: "Network error", detail: String(err) }, { status: 502 });
  }
}
