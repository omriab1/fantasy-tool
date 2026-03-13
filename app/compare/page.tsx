"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useFantasyLeague } from "@/hooks/useFantasyLeague";
import { useFantasyPlayers } from "@/hooks/useFantasyPlayers";
import { calcTradeScore } from "@/lib/trade-score";
import { aggregateStats } from "@/lib/stat-calculator";
import { scoringConfigLabel } from "@/lib/scoring-config";
import { swidMatchesOwner } from "@/lib/swid-parser";
import { cacheGet, cacheSet, cacheKey } from "@/lib/espn-cache";
import { SPORT_CONFIGS, getStatsWindowNote } from "@/lib/sports-config";
import type { AggregatedStats, CategoryResult, LeagueScoringConfig, EspnSport, StatsWindow, FantasyProvider } from "@/lib/types";
import { TeamSelector } from "@/components/TeamSelector";
import { WeekRangePicker } from "@/components/WeekRangePicker";
import { StatsWindowTabs } from "@/components/StatsWindowTabs";
import { CategoryTable } from "@/components/CategoryTable";
import { VerdictBanner } from "@/components/VerdictBanner";
import { ErrorBanner } from "@/components/ErrorBanner";
import Link from "next/link";

type AnalysisMode = "weeks" | "roster";

function windowLabel(w: StatsWindow): string {
  if (w === "season") return "Season";
  if (w === "proj") return "Proj";
  return `L${w}d`;
}

// ── By-Weeks helpers (unchanged from committed code) ──────────────────────────

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
  const [provider, setProvider] = useState<FantasyProvider>("espn");
  const [yahooLeagueKey, setYahooLeagueKey] = useState("");
  const [yahooB, setYahooB] = useState("");
  const [yahooT, setYahooT] = useState("");
  const [yahooAccessToken, setYahooAccessToken] = useState("");

  // Mode
  const [mode, setMode] = useState<AnalysisMode>("weeks");

  // Teams
  const [teamAId, setTeamAId] = useState<number | null>(null);
  const [teamBId, setTeamBId] = useState<number | null>(null);

  // By-Weeks state
  const [startPeriod, setStartPeriod] = useState(1);
  const [endPeriod, setEndPeriod] = useState(1);

  // By-Roster state
  const [statsWindow, setStatsWindow] = useState<StatsWindow>("season");

  // Shared result state
  const [comparing, setComparing] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [results, setResults] = useState<CategoryResult[] | null>(null);
  const [hasCompared, setHasCompared] = useState(false);

  const autoCompare = useRef(false);
  const autoRosterRecalc = useRef(false);
  const shouldScrollRef = useRef(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function readSettings() {
      const p = (localStorage.getItem("fantasy_provider") as FantasyProvider | null) ?? "espn";
      setProvider(p);
      const storedSport = (localStorage.getItem("espn_sport") as EspnSport | null) ?? "fba";
      const validSport  = storedSport in SPORT_CONFIGS ? storedSport : "fba";
      setSport(validSport);
      const leagueIdFallback = validSport === "fba" ? (localStorage.getItem("espn_leagueId") ?? "") : "";
      setLeagueId(localStorage.getItem(`espn_leagueId_${validSport}`) ?? leagueIdFallback);
      setEspnS2(localStorage.getItem("espn_s2") ?? "");
      setSwid(localStorage.getItem("espn_swid") ?? "");
      setYahooLeagueKey(localStorage.getItem("yahoo_league_key_nba") ?? "");
      setYahooB(localStorage.getItem("yahoo_b") ?? "");
      setYahooT(localStorage.getItem("yahoo_t") ?? "");
      setYahooAccessToken(localStorage.getItem("yahoo_access_token") ?? "");
    }
    readSettings();
    window.addEventListener("fantasy-settings-changed", readSettings);
    return () => window.removeEventListener("fantasy-settings-changed", readSettings);
  }, []);

  const sportConfig = SPORT_CONFIGS[sport];

  const { league, scoringConfig, loading: leagueLoading, error: leagueError } = useFantasyLeague({
    provider,
    espn: { leagueId, espnS2, swid, sport },
    yahoo: { leagueKey: yahooLeagueKey, b: yahooB, t: yahooT },
  });
  const { players, loading: playersLoading, error: playersError } = useFantasyPlayers({
    provider,
    espn: { leagueId, espnS2, swid, window: statsWindow, sport, activeSlotIds: league?.activeLineupSlotIds },
    yahoo: { leagueKey: yahooLeagueKey, b: yahooB, t: yahooT, window: statsWindow },
  });

  useEffect(() => {
    if (!league || !swid) return;
    const match = league.teams.find((t) => swidMatchesOwner(swid, t.ownerId));
    if (match && !teamAId) setTeamAId(match.id);
    const lastCompleted = Math.max(1, league.scoringPeriodId - 1);
    setEndPeriod(lastCompleted);
    setStartPeriod(lastCompleted);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league?.leagueId]);

  useEffect(() => { setResults(null); }, [teamAId, teamBId, mode]);

  // By-Weeks: auto-compare on range change (after first manual Compare press)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (autoCompare.current && mode === "weeks") handleCompare(); }, [startPeriod, endPeriod]);

  // By-Roster: mark auto-recalc pending when stats window changes (after first compare)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (hasCompared && mode === "roster") autoRosterRecalc.current = true; }, [statsWindow]);

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

  // ── By-Weeks compare (original, unchanged) ───────────────────────────────────

  const handleWeeksCompare = useCallback(async () => {
    if (!teamAId || !teamBId || !leagueId || !espnS2 || !swid || !league) return;
    setComparing(true);
    setCompareError(null);
    if (shouldScrollRef.current) setResults(null);
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
      setResults(null);
    } finally {
      setComparing(false);
    }
  }, [teamAId, teamBId, leagueId, espnS2, swid, startPeriod, endPeriod, league, scoringConfig, sport]);

  // ── By-Roster compare (new) ───────────────────────────────────────────────

  const handleRosterCompare = useCallback(() => {
    if (!teamAId || !teamBId || !league || players.length === 0) return;
    setCompareError(null);
    setResults(null);
    setHasCompared(true);

    const teamA = league.teams.find((t) => t.id === teamAId);
    const teamB = league.teams.find((t) => t.id === teamBId);
    if (!teamA || !teamB) return;

    const playerMap = new Map(players.map((p) => [p.playerId, p]));
    const playersA = teamA.rosterPlayerIds
      .map((id) => playerMap.get(id))
      .filter((p): p is NonNullable<typeof p> => p !== undefined);
    const playersB = teamB.rosterPlayerIds
      .map((id) => playerMap.get(id))
      .filter((p): p is NonNullable<typeof p> => p !== undefined);

    const statsA = aggregateStats(playersA, scoringConfig);
    const statsB = aggregateStats(playersB, scoringConfig);
    setResults(calcTradeScore(statsA, statsB, scoringConfig).results);
  }, [teamAId, teamBId, league, players, scoringConfig]);

  // Run pending auto-recalc when players finish loading (must be after handleRosterCompare)
  useEffect(() => {
    if (autoRosterRecalc.current && !playersLoading && players.length > 0) {
      autoRosterRecalc.current = false;
      handleRosterCompare();
    }
  }, [players, playersLoading, handleRosterCompare]);

  const handleCompare = mode === "weeks" ? handleWeeksCompare : handleRosterCompare;

  const noSettings = provider === "yahoo"
    ? !yahooLeagueKey || (!yahooB && !yahooAccessToken)
    : !leagueId || !espnS2 || !swid;
  const teamAWins = results?.filter((r) => r.winner === "giving").length ?? 0;
  const teamBWins = results?.filter((r) => r.winner === "receiving").length ?? 0;
  const numWeeks = endPeriod - startPeriod + 1;
  const rosterReady = players.length > 0 && !playersLoading;
  const rosterUnavailable = !playersLoading && players.length === 0 && !noSettings;
  const canCompare = !!teamAId && !!teamBId && (mode === "weeks" ? !comparing : rosterReady);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Team Comparison</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Head-to-head category comparison between two teams
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
            {/* Team selectors */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <TeamSelector teams={league.teams} value={teamAId} onChange={setTeamAId} label="Team A (You)" />
              <TeamSelector
                teams={league.teams.filter((t) => t.id !== teamAId)}
                value={teamBId}
                onChange={setTeamBId}
                label="Team B (Opponent)"
              />
            </div>

            {/* Mode toggle */}
            <div className="border-t border-white/5 pt-5 mb-5">
              <div className="flex gap-2">
                <button
                  onClick={() => setMode("weeks")}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    mode === "weeks"
                      ? "bg-[#e8193c] text-white"
                      : "text-gray-400 hover:text-white border border-white/10 hover:border-white/20"
                  }`}
                >
                  By Weeks
                </button>
                <button
                  onClick={() => setMode("roster")}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    mode === "roster"
                      ? "bg-[#e8193c] text-white"
                      : "text-gray-400 hover:text-white border border-white/10 hover:border-white/20"
                  }`}
                >
                  By Roster
                </button>
              </div>
            </div>

            {/* By-Weeks controls */}
            {mode === "weeks" && (
              <>
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
              </>
            )}

            {/* By-Roster controls */}
            {mode === "roster" && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm text-gray-400 shrink-0">Stats window:</span>
                  <StatsWindowTabs
                    value={statsWindow}
                    onChange={setStatsWindow}
                    availableWindows={provider === "yahoo" ? ["season", "30", "14", "7"] : sportConfig.availableWindows}
                    note={getStatsWindowNote(sportConfig, statsWindow)}
                  />
                </div>
                <p className="text-xs text-gray-600">Averages of each team&apos;s active roster — players in IR spots are excluded</p>
                {playersLoading && <p className="text-sm text-gray-500">Loading player stats…</p>}
                {playersError && <ErrorBanner message={playersError} />}
                {rosterUnavailable && (
                  <p className="text-sm text-gray-500">
                    No stats available for this window — {sportConfig.name} {sportConfig.seasonYear} season hasn&apos;t started yet.
                  </p>
                )}
              </div>
            )}

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => { shouldScrollRef.current = true; autoCompare.current = true; handleCompare(); }}
                disabled={!canCompare}
                className="bg-[#e8193c] hover:bg-[#c41234] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold px-6 py-1.5 rounded-lg text-sm transition-colors"
              >
                {mode === "weeks" && comparing ? "Loading…" : "Compare"}
              </button>
            </div>
          </div>

          {hasCompared && (
            <div ref={resultsRef} className="scroll-mt-14 flex flex-col gap-4">
              <div>
                <p className="text-center text-xs text-gray-600 mb-2">
                  {sportConfig.name} · {scoringConfigLabel(scoringConfig)}
                </p>

                {/* Quick selects for weeks mode */}
                {mode === "weeks" && (
                  <>
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
                  </>
                )}

                {/* Window selector for roster mode */}
                {mode === "roster" && (
                  <>
                    <div className="flex items-center justify-center gap-2 flex-wrap mb-2">
                      <span className="text-xs text-gray-500 shrink-0">Stats window:</span>
                      <StatsWindowTabs
                        value={statsWindow}
                        onChange={setStatsWindow}
                        availableWindows={provider === "yahoo" ? ["season", "30", "14", "7"] : sportConfig.availableWindows}
                        note={getStatsWindowNote(sportConfig, statsWindow)}
                      />
                    </div>
                    <p className="text-xs text-gray-600 text-center">Averages of each team&apos;s active roster — players in IR spots are excluded</p>
                  </>
                )}
              </div>

              {compareError && <ErrorBanner message={compareError} onRetry={handleCompare} />}
              {comparing && !results && <div className="text-center py-8 text-gray-500 text-sm">Loading…</div>}

              {results && (
                <div className={comparing ? "opacity-40 pointer-events-none" : ""}>
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
                    <div className="bg-[#1a1f2e] border border-white/10 rounded-xl overflow-hidden max-w-lg mx-auto w-full">
                      <CategoryTable mode="matchup" results={results} teamAName={teamAName} teamBName={teamBName} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
