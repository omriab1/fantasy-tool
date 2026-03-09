import { NextRequest, NextResponse } from "next/server";
import { SPORT_CONFIGS, apiBase, apiSegment } from "@/lib/sports-config";
import type { EspnSport } from "@/lib/types";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const leagueId = searchParams.get("leagueId");
  const sport = (searchParams.get("sport") ?? "fba") as EspnSport;
  const mode  = searchParams.get("mode") ?? "cats"; // "cats" | "players"
  const cfg = SPORT_CONFIGS[sport] ?? SPORT_CONFIGS.fba;
  const espnS2 = req.headers.get("x-espn-s2") ?? searchParams.get("s2") ?? "";
  const swid   = req.headers.get("x-espn-swid") ?? searchParams.get("swid") ?? "";

  if (!leagueId) return NextResponse.json({ error: "Missing leagueId" }, { status: 400 });

  const headers = {
    Cookie: `espn_s2=${espnS2}; SWID=${swid}`,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "application/json",
    Referer: "https://fantasy.espn.com/",
    Origin: "https://fantasy.espn.com",
    "x-fantasy-source": "kona",
    "x-fantasy-platform": "kona-PROD-2.7.0-rc-14-p2",
  };

  // ── MODE: cats — show scoring items from league settings ──────────────────
  if (mode === "cats") {
    const url = `${apiBase(cfg)}/games/${apiSegment(cfg)}/seasons/${cfg.seasonYear}/segments/0/leagues/${leagueId}?view=mSettings`;
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `ESPN ${res.status}`, preview: text.slice(0, 300) }, { status: res.status });
    }
    const data = (await res.json()) as Record<string, unknown>;
    const settings = data.settings as Record<string, unknown> | undefined;
    const scoringSettings = settings?.scoringSettings as Record<string, unknown> | undefined;
    const scoringItems = (scoringSettings?.scoringItems as unknown[]) ?? [];
    const items = scoringItems.map((raw) => {
      const item = raw as Record<string, unknown>;
      return { statId: item.statId, isReverseItem: item.isReverseItem, points: item.points, pointsOverrides: item.pointsOverrides };
    });
    return NextResponse.json({ sport, scoringType: scoringSettings?.scoringType, totalScoringItems: items.length, scoringItems: items });
  }

  // ── MODE: players — dump ALL raw stat IDs + values for first 5 players ───
  const year = cfg.statsFallbackYear ?? cfg.seasonYear;
  const seg = apiSegment(cfg);
  // Use global player endpoint (not league-specific) so fallback year works
  const playerUrl = `${apiBase(cfg)}/games/${seg}/seasons/${year}/players?scoringPeriodId=0&view=kona_player_info`;
  const filterHeader = JSON.stringify({ players: { limit: 10, filterStatsForTopScoringPeriodIds: { value: 5, additionalValue: [`00${year}`, `10${year}`] } } });

  const res = await fetch(playerUrl, { headers: { ...headers, "X-Fantasy-Filter": filterHeader }, cache: "no-store" });
  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `ESPN ${res.status}`, preview: text.slice(0, 300) }, { status: res.status });
  }
  const raw = (await res.json()) as unknown;
  const arr: unknown[] = Array.isArray(raw) ? raw : ((raw as Record<string,unknown>).players as unknown[] ?? []);

  const players = arr.slice(0, 5).map((entry) => {
    const e = entry as Record<string, unknown>;
    const poolEntry = e.playerPoolEntry as Record<string, unknown> | undefined;
    const info = (e.player ?? poolEntry?.player) as Record<string, unknown> | undefined;
    const name = info?.fullName ?? "Unknown";
    const statsArr = (info?.stats ?? []) as unknown[];

    // Show ALL stat entries so we can find the right splitType
    const allEntries = statsArr.map((s) => {
      const st = s as Record<string, unknown>;
      const rawStats = (st.stats ?? {}) as Record<string, number>;
      const nonZero: Record<number, number> = {};
      for (const [k, v] of Object.entries(rawStats)) {
        if (v !== 0) nonZero[Number(k)] = Math.round(v * 100) / 100;
      }
      return {
        seasonId: st.seasonId,
        statSourceId: st.statSourceId,
        statSplitTypeId: st.statSplitTypeId,
        nonZeroStats: nonZero,
      };
    });

    return { name, allStatEntries: allEntries };
  });

  return NextResponse.json({ sport, players });
}
