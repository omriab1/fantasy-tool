"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useLeague } from "@/hooks/useLeague";
import { calcTradeScore } from "@/lib/trade-score";
import { swidMatchesOwner } from "@/lib/swid-parser";
import { cacheGet, cacheSet, cacheKey } from "@/lib/espn-cache";
import type { AggregatedStats, CategoryResult } from "@/lib/types";
import { TeamSelector } from "@/components/TeamSelector";
import { WeekRangePicker } from "@/components/WeekRangePicker";
import { CategoryTable } from "@/components/CategoryTable";
import { VerdictBanner } from "@/components/VerdictBanner";
import { ErrorBanner } from "@/components/ErrorBanner";
import Link from "next/link";

// Per-team accumulator for summing raw stats across matchup weeks
interface WeekAccum {
  pts: number; reb: number; ast: number; stl: number; blk: number;
  to: number; threepm: number; fgm: number; fga: number; ftm: number; fta: number;
  weeks: number;
}

const initAccum = (): WeekAccum => ({
  pts: 0, reb: 0, ast: 0, stl: 0, blk: 0,
  to: 0, threepm: 0, fgm: 0, fga: 0, ftm: 0, fta: 0,
  weeks: 0,
});

function accumToStats(acc: WeekAccum): AggregatedStats {
  const w = Math.max(acc.weeks, 1);
  return {
    PTS: acc.pts / w,
    REB: acc.reb / w,
    AST: acc.ast / w,
    STL: acc.stl / w,
    BLK: acc.blk / w,
    TO:  acc.to  / w,
    "3PM": acc.threepm / w,
    "AFG%": acc.fga > 0 ? (acc.fgm + 0.5 * acc.threepm) / acc.fga : 0,
    "FT%":  acc.fta > 0 ? acc.ftm / acc.fta : 0,
  };
}

export default function ComparePage() {
  const [leagueId, setLeagueId] = useState("");
  const [espnS2, setEspnS2] = useState("");
  const [swid, setSwid] = useState("");

  const [teamAId, setTeamAId] = useState<number | null>(null);
  const [teamBId, setTeamBId] = useState<number | null>(null);
  const [startPeriod, setStartPeriod] = useState(1);
  const [endPeriod, setEndPeriod] = useState(1);

  const [comparing, setComparing] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [results, setResults] = useState<CategoryResult[] | null>(null);

  useEffect(() => {
    setLeagueId(localStorage.getItem("espn_leagueId") ?? "");
    setEspnS2(localStorage.getItem("espn_s2") ?? "");
    setSwid(localStorage.getItem("espn_swid") ?? "");
  }, []);

  const { league, loading: leagueLoading, error: leagueError } = useLeague(leagueId, espnS2, swid);

  // Auto-detect your team + init week range
  useEffect(() => {
    if (!league || !swid) return;
    const match = league.teams.find((t) => swidMatchesOwner(swid, t.ownerId));
    if (match && !teamAId) setTeamAId(match.id);
    const lastCompleted = Math.max(1, league.scoringPeriodId - 1);
    setEndPeriod(lastCompleted);
    setStartPeriod(lastCompleted);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league?.leagueId]);

  useEffect(() => { setResults(null); }, [teamAId, teamBId, startPeriod, endPeriod]);

  const teamAName = useMemo(() => league?.teams.find((t) => t.id === teamAId)?.name ?? "Team A", [league, teamAId]);
  const teamBName = useMemo(() => league?.teams.find((t) => t.id === teamBId)?.name ?? "Team B", [league, teamBId]);
  const teamALogo = useMemo(() => league?.teams.find((t) => t.id === teamAId)?.logo, [league, teamAId]);
  const teamBLogo = useMemo(() => league?.teams.find((t) => t.id === teamBId)?.logo, [league, teamBId]);

  const handleCompare = useCallback(async () => {
    if (!teamAId || !teamBId || !leagueId || !espnS2 || !swid || !league) return;
    setComparing(true);
    setCompareError(null);
    setResults(null);

    try {
      // One API call gets the full-season mMatchup schedule with per-category scoreByStat
      const ck = cacheKey("matchupv3", leagueId, String(league.scoringPeriodId));
      let data = cacheGet<Record<string, unknown>>(ck);

      if (!data) {
        const res = await fetch(
          `/api/espn/weekly?leagueId=${encodeURIComponent(leagueId)}&period=${league.scoringPeriodId}`,
          { headers: { "x-espn-s2": espnS2, "x-espn-swid": swid } }
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as Record<string, unknown>;
          throw new Error((body.error as string) ?? `HTTP ${res.status}`);
        }
        data = await res.json() as Record<string, unknown>;
        cacheSet(ck, data);
      }

      const schedule = (data.schedule as unknown[]) ?? [];
      const accumA = initAccum();
      const accumB = initAccum();

      for (let period = startPeriod; period <= endPeriod; period++) {
        for (const matchupItem of schedule) {
          const m = matchupItem as Record<string, unknown>;
          if ((m.matchupPeriodId as number) !== period) continue;

          for (const sideKey of ["home", "away"]) {
            const side = m[sideKey] as Record<string, unknown> | undefined;
            if (!side) continue;

            const tid = side.teamId as number;
            if (tid !== teamAId && tid !== teamBId) continue;

            const cs = side.cumulativeScore as Record<string, unknown> | undefined;
            const sbs = cs?.scoreByStat as Record<string, { score: number }> | undefined;
            if (!sbs) continue;

            const get = (id: number) => sbs[String(id)]?.score ?? 0;
            const acc = tid === teamAId ? accumA : accumB;

            acc.pts     += get(0);
            acc.blk     += get(1);
            acc.stl     += get(2);
            acc.ast     += get(3);
            acc.reb     += get(6);
            acc.to      += get(11);
            acc.fgm     += get(13);
            acc.fga     += get(14);
            acc.ftm     += get(15);
            acc.fta     += get(16);
            acc.threepm += get(17);
            acc.weeks++;
          }
        }
      }

      if (accumA.weeks === 0 && accumB.weeks === 0) {
        throw new Error(
          "No matchup data found for the selected week range. " +
          "Future weeks or weeks beyond the schedule won't have stats yet."
        );
      }

      const statsA = accumToStats(accumA);
      const statsB = accumToStats(accumB);
      setResults(calcTradeScore(statsA, statsB).results);
    } catch (err) {
      setCompareError((err as Error).message);
    } finally {
      setComparing(false);
    }
  }, [teamAId, teamBId, leagueId, espnS2, swid, startPeriod, endPeriod, league]);

  const noSettings = !leagueId || !espnS2 || !swid;
  const teamAWins = results?.filter((r) => r.winner === "giving").length ?? 0;
  const teamBWins = results?.filter((r) => r.winner === "receiving").length ?? 0;
  const numWeeks = endPeriod - startPeriod + 1;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Team Comparison</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Head-to-head stats by fantasy matchup week — using actual ESPN matchup results
        </p>
      </div>

      {noSettings && (
        <div className="mb-6 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 text-sm text-yellow-300">
          Set your credentials in{" "}
          <Link href="/settings" className="underline hover:text-yellow-200">Settings</Link> first.
        </div>
      )}

      {leagueError && <div className="mb-6"><ErrorBanner message={leagueError} /></div>}
      {compareError && <div className="mb-6"><ErrorBanner message={compareError} onRetry={handleCompare} /></div>}
      {leagueLoading && <div className="text-center py-8 text-gray-500 text-sm">Loading league…</div>}

      {league && !leagueLoading && (
        <>
          <div className="bg-[#1a1f2e] border border-white/10 rounded-xl p-6 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <TeamSelector teams={league.teams} value={teamAId} onChange={setTeamAId} label="Team A (You)" />
              <TeamSelector
                teams={league.teams.filter((t) => t.id !== teamAId)}
                value={teamBId}
                onChange={setTeamBId}
                label="Team B (Opponent)"
              />
            </div>

            <div className="border-t border-white/5 pt-6">
              <WeekRangePicker
                currentPeriod={league.scoringPeriodId}
                startPeriod={startPeriod}
                endPeriod={endPeriod}
                onStartChange={setStartPeriod}
                onEndChange={setEndPeriod}
              />
              <p className="mt-2 text-xs text-gray-600">
                {numWeeks} matchup week{numWeeks !== 1 ? "s" : ""} — weekly totals averaged across selected range
              </p>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={handleCompare}
                disabled={!teamAId || !teamBId || comparing}
                className="bg-[#e8193c] hover:bg-[#c41234] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold px-8 py-2.5 rounded-lg transition-colors"
              >
                {comparing ? "Loading…" : "Compare"}
              </button>
            </div>
          </div>

          {results && (
            <div className="flex flex-col gap-4">
              <VerdictBanner
                type="matchup"
                teamAName={teamAName}
                teamBName={teamBName}
                teamAWins={teamAWins}
                teamBWins={teamBWins}
                teamALogo={teamALogo}
                teamBLogo={teamBLogo}
              />
              <div className="bg-[#1a1f2e] border border-white/10 rounded-xl overflow-hidden">
                <CategoryTable mode="matchup" results={results} teamAName={teamAName} teamBName={teamBName} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
