"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useLeague } from "@/hooks/useLeague";
import { calcTradeScore } from "@/lib/trade-score";
import { scoringConfigLabel } from "@/lib/scoring-config";
import { swidMatchesOwner } from "@/lib/swid-parser";
import { cacheGet, cacheSet, cacheKey } from "@/lib/espn-cache";
import { SPORT_CONFIGS } from "@/lib/sports-config";
import type { AggregatedStats, CategoryResult, LeagueScoringConfig, EspnSport } from "@/lib/types";
import { TeamSelector } from "@/components/TeamSelector";
import { WeekRangePicker } from "@/components/WeekRangePicker";
import { CategoryTable } from "@/components/CategoryTable";
import { VerdictBanner } from "@/components/VerdictBanner";
import { ErrorBanner } from "@/components/ErrorBanner";
import Link from "next/link";

// Per-team accumulator: raw stat totals by ESPN stat ID.
// Key -1 is reserved for the week count.
const WEEKS_KEY = -1;

type WeekAccum = Record<number, number>;

const initAccum = (): WeekAccum => ({ [WEEKS_KEY]: 0 });

function accumToStats(acc: WeekAccum, config: LeagueScoringConfig): AggregatedStats {
  const weeks = Math.max(acc[WEEKS_KEY] ?? 0, 1);
  const result: AggregatedStats = {};
  for (const cat of config.cats) {
    result[cat.id] = cat.compute(acc, weeks);
  }
  return result;
}

export default function ComparePage() {
  const [leagueId, setLeagueId] = useState("");
  const [espnS2, setEspnS2] = useState("");
  const [swid, setSwid] = useState("");
  const [sport, setSport] = useState<EspnSport>("fba");

  const [teamAId, setTeamAId] = useState<number | null>(null);
  const [teamBId, setTeamBId] = useState<number | null>(null);
  const [startPeriod, setStartPeriod] = useState(1);
  const [endPeriod, setEndPeriod] = useState(1);

  const [comparing, setComparing] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [results, setResults] = useState<CategoryResult[] | null>(null);
  const [hasCompared, setHasCompared] = useState(false);

  const autoCompare = useRef(false);
  const shouldScrollRef = useRef(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const storedSport = (localStorage.getItem("espn_sport") as EspnSport | null) ?? "fba";
    const validSport  = storedSport in SPORT_CONFIGS ? storedSport : "fba";
    setSport(validSport);
    setLeagueId(
      localStorage.getItem(`espn_leagueId_${validSport}`) ??
      localStorage.getItem("espn_leagueId") ??
      ""
    );
    setEspnS2(localStorage.getItem("espn_s2") ?? "");
    setSwid(localStorage.getItem("espn_swid") ?? "");
  }, []);

  const sportConfig = SPORT_CONFIGS[sport];

  const { league, scoringConfig, loading: leagueLoading, error: leagueError } = useLeague(leagueId, espnS2, swid, sport);

  useEffect(() => {
    if (!league || !swid) return;
    const match = league.teams.find((t) => swidMatchesOwner(swid, t.ownerId));
    if (match && !teamAId) setTeamAId(match.id);
    const lastCompleted = Math.max(1, league.scoringPeriodId - 1);
    setEndPeriod(lastCompleted);
    setStartPeriod(lastCompleted);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league?.leagueId]);

  useEffect(() => { setResults(null); }, [teamAId, teamBId]);

  // Auto-compare on range change (only after first manual Compare press)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (autoCompare.current) handleCompare(); }, [startPeriod, endPeriod]);

  // Scroll to results after a manual Compare press
  useEffect(() => {
    if (results !== null && shouldScrollRef.current) {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      shouldScrollRef.current = false;
    }
  }, [results]);

  const teamAName = useMemo(() => league?.teams.find((t) => t.id === teamAId)?.name ?? "Team A", [league, teamAId]);
  const teamBName = useMemo(() => league?.teams.find((t) => t.id === teamBId)?.name ?? "Team B", [league, teamBId]);
  const teamALogo = useMemo(() => league?.teams.find((t) => t.id === teamAId)?.logo, [league, teamAId]);
  const teamBLogo = useMemo(() => league?.teams.find((t) => t.id === teamBId)?.logo, [league, teamBId]);

  const handleCompare = useCallback(async () => {
    if (!teamAId || !teamBId || !leagueId || !espnS2 || !swid || !league) return;
    setComparing(true);
    setCompareError(null);
    setResults(null);
    setHasCompared(true);

    try {
      const ck = cacheKey("matchupv3", leagueId, `${sport}_${league.scoringPeriodId}`);
      let data = cacheGet<Record<string, unknown>>(ck);

      if (!data) {
        const res = await fetch(
          `/api/espn/weekly?leagueId=${encodeURIComponent(leagueId)}&period=${league.scoringPeriodId}&sport=${sport}`,
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

            const acc = tid === teamAId ? accumA : accumB;

            // Collect ALL stat IDs from scoreByStat — cat.compute picks what it needs
            for (const [sidStr, entry] of Object.entries(sbs)) {
              const sid = parseInt(sidStr, 10);
              if (!isNaN(sid)) acc[sid] = (acc[sid] ?? 0) + entry.score;
            }
            acc[WEEKS_KEY]++;
          }
        }
      }

      if ((accumA[WEEKS_KEY] ?? 0) === 0 && (accumB[WEEKS_KEY] ?? 0) === 0) {
        throw new Error(
          "No matchup data found for the selected week range. " +
          "Future weeks or weeks beyond the schedule won't have stats yet."
        );
      }

      const statsA = accumToStats(accumA, scoringConfig);
      const statsB = accumToStats(accumB, scoringConfig);
      setResults(calcTradeScore(statsA, statsB, scoringConfig).results);
    } catch (err) {
      setCompareError((err as Error).message);
    } finally {
      setComparing(false);
    }
  }, [teamAId, teamBId, leagueId, espnS2, swid, startPeriod, endPeriod, league, scoringConfig, sport]);

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
                onClick={() => { shouldScrollRef.current = true; autoCompare.current = true; handleCompare(); }}
                disabled={!teamAId || !teamBId || comparing}
                className="bg-[#e8193c] hover:bg-[#c41234] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold px-8 py-2.5 rounded-lg transition-colors"
              >
                {comparing ? "Loading…" : "Compare"}
              </button>
            </div>
          </div>

          {hasCompared && (
            <div ref={resultsRef} className="scroll-mt-14 flex flex-col gap-4">
              {/* Config label + quick week select — matches power rankings style */}
              <div>
                <p className="text-center text-xs text-gray-600 mb-2">
                  {sportConfig.name} · {scoringConfigLabel(scoringConfig)}
                </p>
                <div className="flex items-center justify-center gap-2 flex-wrap mb-2">
                  <span className="text-xs text-gray-500 shrink-0">Quick select:</span>
                  {[1, 2, 3, 4, 6, 8].map((n) => {
                    const lastEnd = Math.max(1, league.scoringPeriodId - 1);
                    const presetStart = Math.max(1, lastEnd - n + 1);
                    const active = startPeriod === presetStart && endPeriod === lastEnd;
                    return (
                      <button
                        key={n}
                        onClick={() => { setStartPeriod(presetStart); setEndPeriod(lastEnd); }}
                        className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                          active ? "bg-[#e8193c] border-[#e8193c] text-white" : "border-white/10 text-gray-400 hover:text-white hover:border-white/20"
                        }`}
                      >
                        Last {n}w
                      </button>
                    );
                  })}
                  <button
                    onClick={() => { setStartPeriod(1); setEndPeriod(Math.max(1, league.scoringPeriodId - 1)); }}
                    className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                      startPeriod === 1 && endPeriod === Math.max(1, league.scoringPeriodId - 1)
                        ? "bg-[#e8193c] border-[#e8193c] text-white"
                        : "border-white/10 text-gray-400 hover:text-white hover:border-white/20"
                    }`}
                  >
                    Season
                  </button>
                </div>
                <p className="text-xs text-gray-600 text-center">
                  {numWeeks} matchup week{numWeeks !== 1 ? "s" : ""} — weekly totals averaged across selected range
                </p>
              </div>

              {compareError && <ErrorBanner message={compareError} onRetry={handleCompare} />}
              {comparing && <div className="text-center py-8 text-gray-500 text-sm">Loading…</div>}

              {results && !comparing && (
                <>
                  <VerdictBanner
                    type="matchup"
                    teamAName={teamAName}
                    teamBName={teamBName}
                    teamAWins={teamAWins}
                    teamBWins={teamBWins}
                    teamALogo={teamALogo}
                    teamBLogo={teamBLogo}
                  />
                  <div className="bg-[#1a1f2e] border border-white/10 rounded-xl overflow-hidden max-w-lg mx-auto w-full">
                    <CategoryTable mode="matchup" results={results} teamAName={teamAName} teamBName={teamBName} />
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
