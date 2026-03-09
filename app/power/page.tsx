"use client";

import { Fragment, useState, useEffect, useCallback, useRef } from "react";
import { useLeague } from "@/hooks/useLeague";
import { usePlayers } from "@/hooks/usePlayers";
import { calcTradeScore } from "@/lib/trade-score";
import { fmt, aggregateStats } from "@/lib/stat-calculator";
import { scoringConfigLabel } from "@/lib/scoring-config";
import { cacheGet, cacheSet, cacheKey } from "@/lib/espn-cache";
import { SPORT_CONFIGS, getStatsWindowNote } from "@/lib/sports-config";
import type { AggregatedStats, PowerMatchup, PowerRankEntry, LeagueScoringConfig, EspnSport, StatsWindow } from "@/lib/types";
import { WeekRangePicker } from "@/components/WeekRangePicker";
import { StatsWindowTabs } from "@/components/StatsWindowTabs";
import { ErrorBanner } from "@/components/ErrorBanner";
import Link from "next/link";

type AnalysisMode = "weeks" | "roster";

function splitName(name: string): string[] {
  const idx = name.indexOf(" ");
  return idx === -1 ? [name] : [name.slice(0, idx), name.slice(idx + 1)];
}

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

interface RankedEntry extends PowerRankEntry {
  rank: number;
}

// ── Round-robin engine (shared by both modes) ─────────────────────────────────
function runRoundRobin(
  statsMap: Record<number, AggregatedStats>,
  teams: Array<{ id: number; name: string; logo?: string }>,
  scoringConfig: LeagueScoringConfig,
): RankedEntry[] {
  const entriesMap = new Map<number, PowerRankEntry>();
  for (const team of teams) {
    entriesMap.set(team.id, {
      teamId: team.id,
      teamName: team.name,
      teamLogo: team.logo,
      wins: 0,
      losses: 0,
      ties: 0,
      winPct: 0,
      matchups: [],
    });
  }

  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const teamA = teams[i];
      const teamB = teams[j];
      const result = calcTradeScore(statsMap[teamA.id], statsMap[teamB.id], scoringConfig);
      const aCatWins = result.losses;
      const bCatWins = result.winsForReceiving;
      const pushes   = result.equals;

      const entryA = entriesMap.get(teamA.id)!;
      const entryB = entriesMap.get(teamB.id)!;

      let aResult: PowerMatchup["result"];
      let bResult: PowerMatchup["result"];

      if (aCatWins > bCatWins) {
        aResult = "W"; bResult = "L";
        entryA.wins++; entryB.losses++;
      } else if (bCatWins > aCatWins) {
        aResult = "L"; bResult = "W";
        entryB.wins++; entryA.losses++;
      } else {
        aResult = "T"; bResult = "T";
        entryA.ties++; entryB.ties++;
      }

      entryA.matchups.push({
        opponentId: teamB.id,
        opponentName: teamB.name,
        opponentLogo: teamB.logo,
        teamCatWins: aCatWins,
        oppCatWins: bCatWins,
        pushes,
        result: aResult,
      });
      entryB.matchups.push({
        opponentId: teamA.id,
        opponentName: teamA.name,
        opponentLogo: teamA.logo,
        teamCatWins: bCatWins,
        oppCatWins: aCatWins,
        pushes,
        result: bResult,
      });
    }
  }

  const entries = Array.from(entriesMap.values());
  for (const entry of entries) {
    const total = entry.wins + entry.losses + entry.ties;
    entry.winPct = total > 0 ? ((entry.wins + 0.5 * entry.ties) / total) * 100 : 0;
  }

  entries.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (a.losses !== b.losses) return a.losses - b.losses;
    return b.winPct - a.winPct;
  });

  const ranked: RankedEntry[] = [];
  let idx = 0;
  while (idx < entries.length) {
    let jdx = idx + 1;
    while (
      jdx < entries.length &&
      entries[jdx].wins === entries[idx].wins &&
      entries[jdx].losses === entries[idx].losses &&
      entries[jdx].ties === entries[idx].ties
    ) {
      jdx++;
    }

    const group = entries.slice(idx, jdx);
    const rank = idx + 1;

    if (group.length > 1) {
      group.sort((a, b) => {
        const m = a.matchups.find((mu) => mu.opponentId === b.teamId);
        if (m?.result === "W") return -1;
        if (m?.result === "L") return 1;
        return 0;
      });
    }

    for (const entry of group) {
      ranked.push({ ...entry, rank });
    }
    idx = jdx;
  }

  return ranked;
}

function MatchupTooltip({
  teamName, opponentName, teamStats, oppStats, scoringConfig, anchorLeft, anchorBottom,
}: {
  teamName: string; opponentName: string;
  teamStats: AggregatedStats; oppStats: AggregatedStats;
  scoringConfig: LeagueScoringConfig;
  anchorLeft: number; anchorBottom: number;
}) {
  const catResults = calcTradeScore(teamStats, oppStats, scoringConfig).results;
  return (
    <div
      style={{ position: "fixed", left: anchorLeft, bottom: anchorBottom, zIndex: 100 }}
      className="bg-[#0f1117] border border-white/20 rounded-lg shadow-2xl overflow-hidden pointer-events-none"
    >
      <table className="text-xs border-separate border-spacing-0">
        <thead>
          <tr className="border-b border-white/10">
            <th className="w-16 pt-2 pb-1.5 text-center font-normal align-middle">
              {splitName(teamName).map((part, i) => (
                <span key={i} className="text-white font-medium leading-tight block">{part}</span>
              ))}
            </th>
            <th className="w-11" />
            <th className="w-16 pt-2 pb-1.5 text-center font-normal align-middle">
              {splitName(opponentName).map((part, i) => (
                <span key={i} className="text-gray-400 font-medium leading-tight block">{part}</span>
              ))}
            </th>
            <th className="w-14" />
            <th className="w-5" />
          </tr>
          <tr><td colSpan={5} className="border-b border-white/10 p-0" /></tr>
        </thead>
        <tbody>
          {catResults.map((r) => {
            const teamWins = r.winner === "giving";
            const oppWins  = r.winner === "receiving";
            const subPrecision =
              r.winner !== "push" &&
              fmt(r.giving, r.category) === fmt(r.receiving, r.category);
            const absDelta = Math.abs(r.delta);
            const deltaSign = teamWins ? "+" : oppWins ? "-" : "";
            const deltaDisplay = r.winner === "push"
              ? ""
              : subPrecision
              ? (teamWins ? "> +.001" : "< -.001")
              : `${deltaSign}${fmt(absDelta, r.category)}`;

            return (
              <tr key={r.category} className={teamWins ? "bg-green-500/10" : oppWins ? "bg-red-500/10" : ""}>
                <td className={`py-0.5 text-center font-mono tabular-nums w-16 ${teamWins ? "text-green-300 font-semibold" : "text-gray-500"}`}>
                  {fmt(r.giving, r.category)}
                </td>
                <td className="py-0.5 text-center text-gray-600 w-11">{r.category}</td>
                <td className={`py-0.5 text-center font-mono tabular-nums w-16 ${oppWins ? "text-red-300 font-semibold" : "text-gray-500"}`}>
                  {fmt(r.receiving, r.category)}
                </td>
                <td className={`py-0.5 text-center font-mono w-14 text-[10px] whitespace-nowrap ${teamWins ? "text-green-500/70" : oppWins ? "text-red-500/70" : "text-gray-700"}`}>
                  {deltaDisplay}
                </td>
                <td className="py-0.5 text-center w-5">
                  {teamWins
                    ? <span className="text-green-400 font-bold">W</span>
                    : oppWins
                    ? <span className="text-red-400 font-bold">L</span>
                    : <span className="text-gray-500">T</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function PowerPage() {
  const [leagueId, setLeagueId] = useState("");
  const [espnS2, setEspnS2] = useState("");
  const [swid, setSwid] = useState("");
  const [sport, setSport] = useState<EspnSport>("fba");

  // Mode
  const [mode, setMode] = useState<AnalysisMode>("weeks");

  // By-Weeks state
  const [startPeriod, setStartPeriod] = useState(1);
  const [endPeriod, setEndPeriod] = useState(1);

  // By-Roster state
  const [statsWindow, setStatsWindow] = useState<StatsWindow>("season");

  // Shared result state
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rankings, setRankings] = useState<RankedEntry[] | null>(null);
  const [hasCalculated, setHasCalculated] = useState(false);

  const autoCalculate = useRef(false);
  const autoRosterRecalc = useRef(false);
  const shouldScrollRef = useRef(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  const [teamStatsMap, setTeamStatsMap] = useState<Record<number, AggregatedStats> | null>(null);
  const [hoveredMatchup, setHoveredMatchup] = useState<{
    teamId: number; opponentId: number;
    teamName: string; opponentName: string;
    anchorLeft: number; anchorBottom: number;
  } | null>(null);

  const [expandedTeamId, setExpandedTeamId] = useState<number | null>(null);
  const [expandedType, setExpandedType] = useState<"W" | "L" | "T" | null>(null);

  useEffect(() => {
    function readSettings() {
      const storedSport = (localStorage.getItem("espn_sport") as EspnSport | null) ?? "fba";
      const validSport  = storedSport in SPORT_CONFIGS ? storedSport : "fba";
      setSport(validSport);
      const leagueIdFallback = validSport === "fba" ? (localStorage.getItem("espn_leagueId") ?? "") : "";
      setLeagueId(localStorage.getItem(`espn_leagueId_${validSport}`) ?? leagueIdFallback);
      setEspnS2(localStorage.getItem("espn_s2") ?? "");
      setSwid(localStorage.getItem("espn_swid") ?? "");
    }
    readSettings();
    window.addEventListener("espn-settings-changed", readSettings);
    return () => window.removeEventListener("espn-settings-changed", readSettings);
  }, []);

  const sportConfig = SPORT_CONFIGS[sport];

  const { league, scoringConfig, loading: leagueLoading, error: leagueError } = useLeague(leagueId, espnS2, swid, sport);
  const { players, loading: playersLoading } = usePlayers(leagueId, espnS2, swid, statsWindow, sport, league?.activeLineupSlotIds);

  useEffect(() => {
    if (!league) return;
    const lastCompleted = Math.max(1, league.scoringPeriodId - 1);
    setEndPeriod(lastCompleted);
    setStartPeriod(lastCompleted);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league?.leagueId]);

  // Mode change: clear results
  useEffect(() => { setRankings(null); setTeamStatsMap(null); }, [mode]);

  useEffect(() => { setRankings(null); setTeamStatsMap(null); }, [startPeriod, endPeriod]);

  // By-Weeks: auto-calculate on range change (only after first manual Calculate press)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (autoCalculate.current && mode === "weeks") handleWeeksCalculate(); }, [startPeriod, endPeriod]);

  // By-Roster: mark auto-recalc pending when stats window changes (after first calculate)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (hasCalculated && mode === "roster") autoRosterRecalc.current = true; }, [statsWindow]);

  // Scroll to results after a manual Calculate press
  useEffect(() => {
    if (rankings !== null && shouldScrollRef.current) {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      shouldScrollRef.current = false;
    }
  }, [rankings]);

  // ── By-Weeks calculate (original, unchanged) ──────────────────────────────
  const handleWeeksCalculate = useCallback(async () => {
    if (!leagueId || !espnS2 || !swid || !league) return;
    setCalculating(true);
    setError(null);
    setRankings(null);
    setTeamStatsMap(null);
    setExpandedTeamId(null);
    setExpandedType(null);
    setHasCalculated(true);

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

      const accumMap = new Map<number, WeekAccum>();
      for (const team of league.teams) {
        accumMap.set(team.id, initAccum());
      }

      for (let period = startPeriod; period <= endPeriod; period++) {
        for (const matchupItem of schedule) {
          const m = matchupItem as Record<string, unknown>;
          if ((m.matchupPeriodId as number) !== period) continue;

          for (const sideKey of ["home", "away"]) {
            const side = m[sideKey] as Record<string, unknown> | undefined;
            if (!side) continue;

            const tid = side.teamId as number;
            const acc = accumMap.get(tid);
            if (!acc) continue;

            const cs = side.cumulativeScore as Record<string, unknown> | undefined;
            const sbs = cs?.scoreByStat as Record<string, { score: number }> | undefined;
            if (!sbs) continue;

            // Collect ALL stat IDs from scoreByStat — cat.compute picks what it needs
            for (const [sidStr, entry] of Object.entries(sbs)) {
              const sid = parseInt(sidStr, 10);
              if (!isNaN(sid)) acc[sid] = (acc[sid] ?? 0) + entry.score;
            }
            acc[WEEKS_KEY]++;
          }
        }
      }

      const totalWeeks = Array.from(accumMap.values()).reduce((s, a) => s + (a[WEEKS_KEY] ?? 0), 0);
      if (totalWeeks === 0) {
        throw new Error(
          "No matchup data found for the selected week range. " +
          "Future weeks or weeks beyond the schedule won't have stats yet."
        );
      }

      const statsMap: Record<number, AggregatedStats> = {};
      for (const team of league.teams) {
        statsMap[team.id] = accumToStats(accumMap.get(team.id)!, scoringConfig);
      }

      setTeamStatsMap(statsMap);
      setRankings(runRoundRobin(statsMap, league.teams, scoringConfig));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCalculating(false);
    }
  }, [leagueId, espnS2, swid, startPeriod, endPeriod, league, scoringConfig, sport]);

  // ── By-Roster calculate (new) ─────────────────────────────────────────────
  const handleRosterCalculate = useCallback(() => {
    if (!league || players.length === 0) return;
    setError(null);
    setRankings(null);
    setTeamStatsMap(null);
    setExpandedTeamId(null);
    setExpandedType(null);
    setHasCalculated(true);

    try {
      const playerMap = new Map(players.map((p) => [p.playerId, p]));
      const statsMap: Record<number, AggregatedStats> = {};
      for (const team of league.teams) {
        const rosterPlayers = team.rosterPlayerIds
          .map((id) => playerMap.get(id))
          .filter((p): p is NonNullable<typeof p> => p !== undefined);
        statsMap[team.id] = aggregateStats(rosterPlayers, scoringConfig);
      }
      setTeamStatsMap(statsMap);
      setRankings(runRoundRobin(statsMap, league.teams, scoringConfig));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [league, players, scoringConfig]);

  // Run pending auto-recalc when players finish loading (must be after handleRosterCalculate)
  useEffect(() => {
    if (autoRosterRecalc.current && !playersLoading && players.length > 0) {
      autoRosterRecalc.current = false;
      handleRosterCalculate();
    }
  }, [players, playersLoading, handleRosterCalculate]);

  const handleCalculate = mode === "weeks" ? handleWeeksCalculate : handleRosterCalculate;

  function handleExpandToggle(teamId: number, type: "W" | "L" | "T") {
    if (expandedTeamId === teamId && expandedType === type) {
      setExpandedTeamId(null);
      setExpandedType(null);
    } else {
      setExpandedTeamId(teamId);
      setExpandedType(type);
    }
  }

  const noSettings = !leagueId || !espnS2 || !swid;
  const numWeeks = endPeriod - startPeriod + 1;
  const rosterReady = players.length > 0 && !playersLoading;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Power Rankings</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Full round-robin — every team vs every other team
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

      {hoveredMatchup && teamStatsMap && (
        <MatchupTooltip
          teamName={hoveredMatchup.teamName}
          opponentName={hoveredMatchup.opponentName}
          teamStats={teamStatsMap[hoveredMatchup.teamId]}
          oppStats={teamStatsMap[hoveredMatchup.opponentId]}
          scoringConfig={scoringConfig}
          anchorLeft={hoveredMatchup.anchorLeft}
          anchorBottom={hoveredMatchup.anchorBottom}
        />
      )}

      {league && !leagueLoading && (
        <>
          {scoringConfig.format === "roto" && (
            <div className="mb-4 bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-sm text-blue-300">
              Power Rankings is a head-to-head simulation. Your Roto league&apos;s actual standings are based on season totals.
            </div>
          )}

          <div className="bg-[#1a1f2e] border border-white/10 rounded-xl p-6 mb-6">
            {/* Mode toggle */}
            <div className="mb-5">
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
                    availableWindows={sportConfig.availableWindows}
                    note={getStatsWindowNote(sportConfig, statsWindow)}
                  />
                </div>
                <p className="text-xs text-gray-600">Averages of each team&apos;s active roster — players in IR spots are excluded</p>
                {playersLoading && <p className="text-sm text-gray-500">Loading player stats…</p>}
              </div>
            )}

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => { shouldScrollRef.current = true; autoCalculate.current = true; handleCalculate(); }}
                disabled={calculating || (mode === "roster" && !rosterReady)}
                className="bg-[#e8193c] hover:bg-[#c41234] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold px-6 py-1.5 rounded-lg text-sm transition-colors"
              >
                {calculating ? "Calculating…" : "Calculate"}
              </button>
            </div>
          </div>

          {hasCalculated && (
            <div ref={resultsRef} className="scroll-mt-14 flex flex-col gap-4">
              {/* Config label + mode info — first thing visible after scroll */}
              <div>
                <p className="text-center text-xs text-gray-600 mb-2">
                  {sportConfig.name} · {scoringConfigLabel(scoringConfig)}
                </p>

                {/* By-Weeks: quick week selects */}
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

                {/* By-Roster: window selector */}
                {mode === "roster" && (
                  <>
                    <div className="flex items-center justify-center gap-2 flex-wrap mb-2">
                      <span className="text-xs text-gray-500 shrink-0">Stats window:</span>
                      <StatsWindowTabs
                        value={statsWindow}
                        onChange={setStatsWindow}
                        availableWindows={sportConfig.availableWindows}
                        note={getStatsWindowNote(sportConfig, statsWindow)}
                      />
                    </div>
                    <p className="text-xs text-gray-600 text-center">Averages of each team&apos;s active roster — players in IR spots are excluded</p>
                  </>
                )}
              </div>

              {error && <ErrorBanner message={error} onRetry={handleCalculate} />}
              {calculating && <div className="text-center py-8 text-gray-500 text-sm">Calculating…</div>}

              {rankings && !calculating && (
              <div className="bg-[#1a1f2e] border border-white/10 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-gray-500 text-xs uppercase tracking-wider">
                      <th className="px-2 py-2.5 text-left">#</th>
                      <th className="px-2 py-2.5 text-left">Team</th>
                      <th className="px-2 py-2.5 text-center">W</th>
                      <th className="px-2 py-2.5 text-center">L</th>
                      <th className="px-2 py-2.5 text-center">T</th>
                      <th className="px-2 py-2.5 text-center">W%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankings.map((entry) => {
                      const isExpanded = expandedTeamId === entry.teamId;
                      const showBreakdown = isExpanded && expandedType !== null;
                      const breakdownMatchups = expandedType
                        ? entry.matchups.filter((m) => m.result === expandedType)
                        : [];

                      return (
                        <Fragment key={entry.teamId}>
                          <tr
                            className="border-b border-white/5 hover:bg-white/[0.02] transition-colors cursor-pointer"
                            onClick={() => {
                              setExpandedTeamId(null);
                              setExpandedType(null);
                            }}
                          >
                            <td className="px-2 py-2.5 text-gray-500 font-mono">{entry.rank}</td>
                            <td className="px-2 py-2.5">
                              <div className="flex items-center gap-1.5">
                                <div className="w-6 h-6 shrink-0">
                                  {entry.teamLogo && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={entry.teamLogo}
                                      alt=""
                                      className="w-6 h-6 rounded-sm object-contain"
                                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                                    />
                                  )}
                                </div>
                                <span className="text-white font-medium text-sm leading-tight">{entry.teamName}</span>
                              </div>
                            </td>
                            <td className="px-2 py-2.5 text-center">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleExpandToggle(entry.teamId, "W"); }}
                                className={`font-bold tabular-nums underline cursor-pointer transition-colors ${
                                  isExpanded && expandedType === "W"
                                    ? "text-[#e8193c]"
                                    : "text-green-400 hover:text-green-300"
                                }`}
                              >
                                {entry.wins}
                              </button>
                            </td>
                            <td className="px-2 py-2.5 text-center">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleExpandToggle(entry.teamId, "L"); }}
                                className={`font-bold tabular-nums underline cursor-pointer transition-colors ${
                                  isExpanded && expandedType === "L"
                                    ? "text-[#e8193c]"
                                    : "text-red-400 hover:text-red-300"
                                }`}
                              >
                                {entry.losses}
                              </button>
                            </td>
                            <td className="px-2 py-2.5 text-center">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleExpandToggle(entry.teamId, "T"); }}
                                className={`font-bold tabular-nums underline cursor-pointer transition-colors ${
                                  isExpanded && expandedType === "T"
                                    ? "text-[#e8193c]"
                                    : "text-gray-400 hover:text-gray-200"
                                }`}
                              >
                                {entry.ties}
                              </button>
                            </td>
                            <td className="px-2 py-2.5 text-center text-gray-300 tabular-nums">
                              {entry.winPct.toFixed(1)}%
                            </td>
                          </tr>

                          {showBreakdown && (
                            <tr className="bg-[#0f1117]">
                              <td colSpan={6} className="px-6 py-3">
                                <div className="flex flex-col gap-1.5">
                                  <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">
                                    {expandedType === "W" ? "Wins" : expandedType === "L" ? "Losses" : "Ties"} breakdown
                                  </p>
                                  {breakdownMatchups.length === 0 ? (
                                    <p className="text-gray-600 text-xs">
                                      No {expandedType === "W" ? "wins" : expandedType === "L" ? "losses" : "ties"}
                                    </p>
                                  ) : (
                                    breakdownMatchups.map((m) => (
                                      <div key={m.opponentId} className="flex items-center gap-2 text-sm">
                                        <div className="w-5 h-5 shrink-0">
                                          {m.opponentLogo && (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                              src={m.opponentLogo}
                                              alt=""
                                              className="w-5 h-5 rounded-sm object-contain"
                                              onError={(e) => { e.currentTarget.style.display = "none"; }}
                                            />
                                          )}
                                        </div>
                                        <span className="text-gray-300 min-w-0 flex-1">{m.opponentName}</span>
                                        <span
                                          className="ml-3 text-gray-500 tabular-nums shrink-0 cursor-default"
                                          onMouseEnter={(e) => {
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            const tooltipWidth = 248;
                                            const left = Math.min(
                                              Math.max(8, rect.left + rect.width / 2 - tooltipWidth / 2),
                                              window.innerWidth - tooltipWidth - 8,
                                            );
                                            setHoveredMatchup({
                                              teamId: entry.teamId,
                                              opponentId: m.opponentId,
                                              teamName: entry.teamName,
                                              opponentName: m.opponentName,
                                              anchorLeft: left,
                                              anchorBottom: window.innerHeight - rect.top + 6,
                                            });
                                          }}
                                          onMouseLeave={() => setHoveredMatchup(null)}
                                        >
                                          {m.teamCatWins}-{m.oppCatWins}-{m.pushes}
                                        </span>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
