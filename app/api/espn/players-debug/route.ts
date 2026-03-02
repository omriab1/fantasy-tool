import { NextRequest, NextResponse } from "next/server";
import { SPORT_CONFIGS, apiSegment } from "@/lib/sports-config";
import type { EspnSport } from "@/lib/types";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const leagueId = searchParams.get("leagueId");
  const sport = (searchParams.get("sport") ?? "fba") as EspnSport;
  const cfg = SPORT_CONFIGS[sport] ?? SPORT_CONFIGS.fba;
  const espnS2 = req.headers.get("x-espn-s2") ?? "";
  const swid = req.headers.get("x-espn-swid") ?? "";

  if (!leagueId) return NextResponse.json({ error: "Missing leagueId" }, { status: 400 });

  const y = cfg.seasonYear;
  const fbY = cfg.statsFallbackYear;
  const statsYear = fbY ?? y;

  // Build both the global (fallback) and league-specific URLs so we can test both
  const globalUrl = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/${apiSegment(cfg)}/seasons/${statsYear}/players?scoringPeriodId=0&view=kona_player_info`;
  const leagueUrl = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/${apiSegment(cfg)}/seasons/${y}/segments/0/leagues/${leagueId}/players?scoringPeriodId=0&view=kona_player_info`;

  const filterBody = fbY
    ? { limit: 500, filterStatsForTopScoringPeriodIds: { value: 5, additionalValue: [`00${fbY}`, `10${fbY}`] } }
    : { filterStatsForTopScoringPeriodIds: { value: 5, additionalValue: [`00${y}`, `10${y}`, `00${y - 1}`] } };
  const filterHeader = JSON.stringify({ players: filterBody });

  const headers = {
    Cookie: `espn_s2=${espnS2}; SWID=${swid}`,
    "X-Fantasy-Filter": filterHeader,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://fantasy.espn.com/",
    "Origin": "https://fantasy.espn.com",
    "x-fantasy-source": "kona",
    "x-fantasy-platform": "kona-PROD-2.7.0-rc-14-p2",
  };

  async function probe(url: string) {
    try {
      const res = await fetch(url, { headers, cache: "no-store" });
      const text = await res.text();
      if (!res.ok) return { status: res.status, error: text.slice(0, 300) };
      let data: unknown;
      try { data = JSON.parse(text); } catch { return { status: res.status, error: "Non-JSON", preview: text.slice(0, 300) }; }

      // Inspect structure
      const isArr = Array.isArray(data);
      const arr: unknown[] = isArr
        ? (data as unknown[])
        : (Array.isArray((data as Record<string, unknown>).players)
          ? ((data as Record<string, unknown>).players as unknown[])
          : []);

      const topKeys = isArr ? "(array)" : Object.keys(data as object);
      const count = arr.length;
      const first = arr[0] as Record<string, unknown> | undefined;
      const firstKeys = first ? Object.keys(first) : null;

      // Drill into player info — handle flat format (fullName on entry) too
      const poolEntry = first?.playerPoolEntry as Record<string, unknown> | undefined;
      const playerInfo = (
        (first?.player as Record<string, unknown> | undefined) ??
        (poolEntry?.player as Record<string, unknown> | undefined) ??
        (first?.fullName !== undefined ? first : undefined)
      ) as Record<string, unknown> | undefined;
      const statsArr = (playerInfo?.stats ?? []) as unknown[];

      // Collect unique defaultPositionId and eligibleSlots values across first 20 players
      const posIdSamples = new Map<number, string>();
      const slotIdSamples = new Set<number>();
      for (const p of arr.slice(0, 20)) {
        const pe = p as Record<string, unknown>;
        const pPool = pe.playerPoolEntry as Record<string, unknown> | undefined;
        const pi = (
          (pe.player as Record<string, unknown> | undefined) ??
          (pPool?.player as Record<string, unknown> | undefined) ??
          (pe.fullName !== undefined ? pe : undefined)
        ) as Record<string, unknown> | undefined;
        if (!pi) continue;
        const defPos = pi.defaultPositionId as number | undefined;
        if (defPos !== undefined) posIdSamples.set(defPos, pi.fullName as string ?? "?");
        const slots = (
          (pi.eligibleSlots as number[] | undefined) ??
          (pe.eligibleSlots as number[] | undefined) ?? []
        );
        for (const s of slots) slotIdSamples.add(s);
      }

      return {
        status: res.status,
        topKeys,
        playerCount: count,
        firstEntryKeys: firstKeys,
        firstPlayerName: playerInfo?.fullName ?? null,
        firstPlayerStatsCount: statsArr.length,
        // Position discovery
        defaultPositionIdSamples: Object.fromEntries(posIdSamples),
        eligibleSlotIdsSeen: [...slotIdSamples].sort((a, b) => a - b),
        // Show all stats entries with their key fields so we can see seasonId/statSourceId/statSplitTypeId
        firstPlayerStatsSummary: statsArr.map((s) => {
          const st = s as Record<string, unknown>;
          return {
            seasonId: st.seasonId,
            statSourceId: st.statSourceId,
            statSplitTypeId: st.statSplitTypeId,
            statKeys: Object.keys(st.stats as object ?? {}).slice(0, 5),
          };
        }),
      };
    } catch (err) {
      return { error: String(err) };
    }
  }

  const [globalResult, leagueResult] = await Promise.all([probe(globalUrl), probe(leagueUrl)]);

  return NextResponse.json({
    sport: apiSegment(cfg),
    seasonYear: y,
    statsFallbackYear: fbY ?? null,
    filterSent: filterHeader,
    globalEndpoint: { url: globalUrl, result: globalResult },
    leagueEndpoint: { url: leagueUrl, result: leagueResult },
  });
}
