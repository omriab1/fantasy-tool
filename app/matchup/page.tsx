"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useFantasyLeague } from "@/hooks/useFantasyLeague";
import { useFantasyPlayers } from "@/hooks/useFantasyPlayers";
import { calcTradeScore } from "@/lib/trade-score";
import { fmt } from "@/lib/stat-calculator";
import { scoringConfigLabel } from "@/lib/scoring-config";
import { SPORT_CONFIGS } from "@/lib/sports-config";
import { StatsWindowTabs } from "@/components/StatsWindowTabs";
import { CategoryTable } from "@/components/CategoryTable";
import { VerdictBanner } from "@/components/VerdictBanner";
import { TeamSelector } from "@/components/TeamSelector";
import { ErrorBanner } from "@/components/ErrorBanner";
import { swidMatchesOwner } from "@/lib/swid-parser";
import {
  buildProjectionAccum,
  buildCombinedAccum,
  buildGamesPerPlayer,
  accumToStats,
  type MatchupApiResponse,
  type GamesPerPlayer,
} from "@/lib/matchup-calculator";
import type {
  StatsWindow,
  EspnSport,
  FantasyProvider,
  LeagueScoringConfig,
  AggregatedStats,
} from "@/lib/types";
import type { PlayerStats } from "@/lib/types";
import Link from "next/link";

// ─── Mode ────────────────────────────────────────────────────────────────────

type MatchupMode = "rest" | "projected";

const MODE_LABELS: Record<MatchupMode, string> = {
  rest: "Rest of Matchup",
  projected: "Projected Score",
};

const MODE_DESCRIPTIONS: Record<MatchupMode, string> = {
  rest: "Projected totals for remaining games only using selected stat window",
  projected: "Actual stats accumulated so far + projected remaining games from current roster",
};

// ─── Points league display ───────────────────────────────────────────────────

function PointsMatchup({
  myStats,
  oppStats,
  myName,
  oppName,
}: {
  myStats: AggregatedStats;
  oppStats: AggregatedStats;
  myName: string;
  oppName: string;
}) {
  const myFpts = myStats["FPts"] ?? 0;
  const oppFpts = oppStats["FPts"] ?? 0;
  const myWins = myFpts > oppFpts;
  const oppWins = oppFpts > myFpts;

  return (
    <div className="bg-[#1a1f2e] border border-white/10 rounded-xl p-6 text-center">
      <div className="text-gray-500 text-xs uppercase tracking-widest mb-4">Projected FPts</div>
      <div className="flex items-center justify-around gap-4">
        <div className="flex-1 text-center">
          <div className={`text-4xl font-bold font-mono ${myWins ? "text-green-400" : "text-gray-300"}`}>
            {myFpts.toFixed(1)}
          </div>
          <div className="text-sm text-gray-400 mt-1 truncate">{myName}</div>
        </div>
        <div className="text-gray-600 text-lg font-bold">vs</div>
        <div className="flex-1 text-center">
          <div className={`text-4xl font-bold font-mono ${oppWins ? "text-red-400" : "text-gray-300"}`}>
            {oppFpts.toFixed(1)}
          </div>
          <div className="text-sm text-gray-400 mt-1 truncate">{oppName}</div>
        </div>
      </div>
      <div className={`mt-4 text-lg font-bold tracking-wide ${myWins ? "text-green-400" : oppWins ? "text-red-400" : "text-yellow-400"}`}>
        {myWins ? "YOU WIN THIS MATCHUP" : oppWins ? "YOU LOSE THIS MATCHUP" : "EVEN MATCHUP"}
      </div>
    </div>
  );
}

// ─── Roto display ────────────────────────────────────────────────────────────

function RotoProjection({
  myStats,
  myName,
  scoringConfig,
}: {
  myStats: AggregatedStats;
  myName: string;
  scoringConfig: LeagueScoringConfig;
}) {
  return (
    <div>
      <div className="mb-3 bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-sm text-blue-300">
        Roto leagues rank across the full season — this shows your projected week contribution.
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs uppercase border-b border-white/10">
              <th className="text-center py-2 px-3 font-medium">Category</th>
              <th className="text-center py-2 px-3 font-medium">{myName}</th>
            </tr>
          </thead>
          <tbody>
            {scoringConfig.cats.map((cat) => (
              <tr key={cat.id} className="border-b border-white/5">
                <td className="py-2 px-3 text-center font-medium text-white">
                  {cat.id}
                  {cat.lowerIsBetter && <span className="text-gray-600 text-xs ml-1">↓</span>}
                </td>
                <td className="py-2 px-3 text-center font-mono text-gray-300">
                  {fmt(myStats[cat.id] ?? 0, cat.id)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function MatchupPage() {
  const [leagueId, setLeagueId] = useState("");
  const [espnS2, setEspnS2] = useState("");
  const [swid, setSwid] = useState("");
  const [sport, setSport] = useState<EspnSport>("fba");
  const [statsWindow, setStatsWindow] = useState<StatsWindow>("season");
  const [provider, setProvider] = useState<FantasyProvider>("espn");
  const [yahooLeagueKey, setYahooLeagueKey] = useState("");
  const [yahooB, setYahooB] = useState("");
  const [yahooT, setYahooT] = useState("");
  const [yahooAccessToken, setYahooAccessToken] = useState("");
  const [yahooGuid, setYahooGuid] = useState("");

  const [mode, setMode] = useState<MatchupMode>("projected");
  const [hasCalculated, setHasCalculated] = useState(false);
  const [calculateCount, setCalculateCount] = useState(0);

  // requestedPeriod: null = fetch current period (server default), number = specific period
  const [requestedPeriod, setRequestedPeriod] = useState<number | null>(null);

  const [matchupData, setMatchupData] = useState<MatchupApiResponse | null>(null);
  const [matchupLoading, setMatchupLoading] = useState(false);
  const [matchupError, setMatchupError] = useState<string | null>(null);

  // User-selected teams — reset when matchupData arrives for a new period
  const [selectedMyTeamId, setSelectedMyTeamId] = useState<number | null>(null);
  const [selectedOpponentId, setSelectedOpponentId] = useState<number | null>(null);
  const loadedPeriodRef = useRef<number | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const shouldScrollRef = useRef(false);

  // ── Read settings ──────────────────────────────────────────────────────────

  useEffect(() => {
    function readSettings() {
      const p = (localStorage.getItem("fantasy_provider") as FantasyProvider | null) ?? "espn";
      setProvider(p);
      const storedSport = (localStorage.getItem("espn_sport") as EspnSport | null) ?? "fba";
      const validSport = storedSport in SPORT_CONFIGS ? storedSport : "fba";
      setSport(validSport);
      const leagueIdFallback = validSport === "fba" ? (localStorage.getItem("espn_leagueId") ?? "") : "";
      setLeagueId(localStorage.getItem(`espn_leagueId_${validSport}`) ?? leagueIdFallback);
      setEspnS2(localStorage.getItem("espn_s2") ?? "");
      setSwid(localStorage.getItem("espn_swid") ?? "");
      setYahooLeagueKey(localStorage.getItem("yahoo_league_key_nba") ?? "");
      setYahooB(localStorage.getItem("yahoo_b") ?? "");
      setYahooT(localStorage.getItem("yahoo_t") ?? "");
      setYahooAccessToken(localStorage.getItem("yahoo_access_token") ?? "");
      setYahooGuid(localStorage.getItem("yahoo_guid") ?? "");
    }
    readSettings();
    window.addEventListener("fantasy-settings-changed", readSettings);
    return () => window.removeEventListener("fantasy-settings-changed", readSettings);
  }, []);

  const sportConfig = SPORT_CONFIGS[sport];

  // ── League + players hooks ─────────────────────────────────────────────────

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

  // Auto-detect my team from SWID when league loads (fallback before matchupData arrives)
  useEffect(() => {
    if (!league || !swid || selectedMyTeamId !== null) return;
    const match = league.teams.find((t) => swidMatchesOwner(swid, t.ownerId));
    if (match) setSelectedMyTeamId(match.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league?.leagueId]);

  // ── Fetch matchup data ─────────────────────────────────────────────────────

  useEffect(() => {
    if (provider === "espn") {
      if (!leagueId || !espnS2 || !swid) return;
    } else {
      if (!yahooLeagueKey || (!yahooB && !yahooAccessToken)) return;
    }

    const controller = new AbortController();
    const { signal } = controller;

    setMatchupLoading(true);
    setMatchupError(null);

    const fetchData = async () => {
      try {
        let res: Response;
        if (provider === "espn") {
          const periodSuffix = requestedPeriod != null ? `&period=${requestedPeriod}` : "";
          res = await fetch(
            `/api/espn/matchup?leagueId=${encodeURIComponent(leagueId)}&sport=${sport}${periodSuffix}`,
            { signal, headers: { "x-espn-s2": espnS2, "x-espn-swid": swid } },
          );
        } else {
          const headers: Record<string, string> = {};
          if (yahooAccessToken) headers["x-yahoo-access-token"] = yahooAccessToken;
          if (yahooB) headers["x-yahoo-b"] = yahooB;
          if (yahooT) headers["x-yahoo-t"] = yahooT;
          if (yahooGuid) headers["x-yahoo-guid"] = yahooGuid;
          res = await fetch(
            `/api/yahoo/matchup?leagueKey=${encodeURIComponent(yahooLeagueKey)}`,
            { signal, headers },
          );
        }

        if (signal.aborted) return;

        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as Record<string, unknown>;
          throw new Error((body.error as string) ?? `HTTP ${res.status}`);
        }

        const data = await res.json() as MatchupApiResponse;
        if (signal.aborted) return;

        setMatchupData(data);
        // Reset team selection when loading a new period
        if (loadedPeriodRef.current !== data.matchupPeriodId) {
          setSelectedMyTeamId(data.myTeamId);
          setSelectedOpponentId(data.opponentTeamId);
          loadedPeriodRef.current = data.matchupPeriodId;
        }
      } catch (err) {
        if (signal.aborted) return;
        setMatchupError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!signal.aborted) setMatchupLoading(false);
      }
    };

    fetchData();
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, leagueId, espnS2, swid, sport, yahooLeagueKey, yahooB, yahooT, yahooAccessToken, yahooGuid, requestedPeriod]);

  // ── Derived state ──────────────────────────────────────────────────────────

  // Use requestedPeriod (user's selection) to determine past/future — the API's matchupPeriodId
  // can fall back to the current period when ESPN's schedule doesn't include the requested period.
  const effectiveDisplayPeriod = requestedPeriod ?? matchupData?.matchupPeriodId ?? matchupData?.currentMatchupPeriodId;
  const isPastMatchup = !!matchupData && (effectiveDisplayPeriod ?? 0) < matchupData.currentMatchupPeriodId;

  const noSettings = provider === "yahoo"
    ? !yahooLeagueKey || (!yahooB && !yahooAccessToken)
    : !leagueId || !espnS2 || !swid;

  const myTeam = league?.teams.find((t) => t.id === selectedMyTeamId);
  const oppTeam = league?.teams.find((t) => t.id === selectedOpponentId);

  const myTeamName = myTeam?.name ?? matchupData?.myTeamName ?? "My Team";
  const oppTeamName = oppTeam?.name ?? matchupData?.opponentTeamName ?? "Opponent";

  const hasBye = selectedOpponentId === null || selectedOpponentId === selectedMyTeamId;

  const allTeams = league?.teams ?? [];
  const opponentTeams = useMemo(
    () => allTeams.filter((t) => t.id !== selectedMyTeamId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allTeams, selectedMyTeamId],
  );

  // Build rosters (IR already excluded by hooks + fresh rosterByTeamId from API)
  const myRoster = useMemo((): PlayerStats[] => {
    if (!matchupData || !myTeam) return [];
    // Use fresh roster IDs from API response (reflects recent drops/adds, bypasses 15-min cache)
    const rosterIds = matchupData.rosterByTeamId[myTeam.id] ?? myTeam.rosterPlayerIds;
    return players.filter((p) => rosterIds.includes(p.playerId));
  }, [players, myTeam, matchupData]);

  const oppRoster = useMemo((): PlayerStats[] => {
    if (!matchupData || !oppTeam) return [];
    const rosterIds = matchupData.rosterByTeamId[oppTeam.id] ?? oppTeam.rosterPlayerIds;
    return players.filter((p) => rosterIds.includes(p.playerId));
  }, [players, oppTeam, matchupData]);

  const gamesPerPlayerRem = useMemo((): GamesPerPlayer => {
    if (!matchupData) return {};
    const gameMap = matchupData.gamesRemaining;
    const result = {
      ...buildGamesPerPlayer(myRoster, gameMap),
      ...buildGamesPerPlayer(oppRoster, gameMap),
    };
    // OUT players get 0 remaining projected games
    for (const p of [...myRoster, ...oppRoster]) {
      if (p.injuryStatus === "OUT") result[p.playerId] = 0;
    }
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myRoster, oppRoster, matchupData]);

  const gamesPerPlayer = gamesPerPlayerRem;

  // ── Projection computation ────────────────────────────────────────────────

  const myStats = useMemo((): AggregatedStats | null => {
    if (!matchupData) return null;

    // Past matchup: show actual final accumulated stats (no roster/projection needed)
    if (isPastMatchup) {
      if (selectedMyTeamId == null) return null;
      const actual = matchupData.teamCurrentStats[selectedMyTeamId] ?? {};
      if (Object.keys(actual).length === 0) return null;
      return accumToStats(buildCombinedAccum(actual, {}), scoringConfig);
    }

    if (myRoster.length === 0) return null;

    if (mode === "projected") {
      // Use requestedPeriod (user's selection) — matchupPeriodId from the API can fall back
      // to the current period when ESPN's schedule doesn't include future periods yet,
      // which would incorrectly make isCurrentPeriod=true for a future matchup.
      const effectivePeriod = requestedPeriod ?? matchupData.currentMatchupPeriodId;
      const isCurrentPeriod = effectivePeriod === matchupData.currentMatchupPeriodId;
      const actualMyStats = isCurrentPeriod && selectedMyTeamId != null
        ? (matchupData.teamCurrentStats[selectedMyTeamId] ?? {})
        : {};
      const remAccum = buildProjectionAccum(myRoster, gamesPerPlayerRem);
      const combinedAccum = buildCombinedAccum(actualMyStats, remAccum);
      return accumToStats(combinedAccum, scoringConfig);
    }

    const accum = buildProjectionAccum(myRoster, gamesPerPlayer);
    return accumToStats(accum, scoringConfig);
  }, [myRoster, gamesPerPlayer, gamesPerPlayerRem, matchupData, scoringConfig, mode, selectedMyTeamId, isPastMatchup, requestedPeriod]);

  const oppStats = useMemo((): AggregatedStats | null => {
    if (!matchupData || hasBye || !oppTeam) return null;

    // Past matchup: show actual final accumulated stats
    if (isPastMatchup) {
      if (selectedOpponentId == null) return null;
      const actual = matchupData.teamCurrentStats[selectedOpponentId] ?? {};
      if (Object.keys(actual).length === 0) return null;
      return accumToStats(buildCombinedAccum(actual, {}), scoringConfig);
    }

    if (oppRoster.length === 0) return null;

    if (mode === "projected") {
      const effectivePeriod = requestedPeriod ?? matchupData.currentMatchupPeriodId;
      const isCurrentPeriod = effectivePeriod === matchupData.currentMatchupPeriodId;
      const actualOppStats = isCurrentPeriod && selectedOpponentId != null
        ? (matchupData.teamCurrentStats[selectedOpponentId] ?? {})
        : {};
      const remAccum = buildProjectionAccum(oppRoster, gamesPerPlayerRem);
      const combinedAccum = buildCombinedAccum(actualOppStats, remAccum);
      return accumToStats(combinedAccum, scoringConfig);
    }

    const accum = buildProjectionAccum(oppRoster, gamesPerPlayer);
    return accumToStats(accum, scoringConfig);
  }, [oppRoster, gamesPerPlayer, gamesPerPlayerRem, matchupData, scoringConfig, mode, hasBye, oppTeam, selectedOpponentId, isPastMatchup, requestedPeriod]);

  const analysis = useMemo(() => {
    if (!myStats || !oppStats) return null;
    return calcTradeScore(myStats, oppStats, scoringConfig);
  }, [myStats, oppStats, scoringConfig]);

  // ── Scroll to results when stat window or mode changes ────────────────────
  useEffect(() => {
    if (hasCalculated && shouldScrollRef.current) {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      shouldScrollRef.current = false;
    }
  }, [myStats, hasCalculated, statsWindow, mode, calculateCount]);

  // ── Period selector helpers ────────────────────────────────────────────────

  const displayedPeriod = requestedPeriod ?? matchupData?.matchupPeriodId;
  // currentMatchupPeriodId stays constant (actual current period) regardless of which period is viewed
  const currentPeriod = matchupData?.currentMatchupPeriodId;

  function handlePeriodChange(p: number) {
    setRequestedPeriod(p === currentPeriod ? null : p);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const isLoading = leagueLoading || playersLoading || matchupLoading;
  const myWins = analysis?.losses ?? 0;
  const oppWins = analysis?.winsForReceiving ?? 0;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Matchup Planner</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Project your head-to-head matchup result for this week
        </p>
      </div>

      {/* No settings */}
      {noSettings && (
        <div className="mb-6 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 text-sm text-yellow-300">
          Set your {provider === "yahoo" ? "Yahoo league key" : "League ID and ESPN credentials"} in{" "}
          <Link href="/settings" className="underline hover:text-yellow-200">Settings</Link> first.
        </div>
      )}

      {/* Errors */}
      {leagueError && <div className="mb-4"><ErrorBanner message={leagueError} /></div>}
      {playersError && <div className="mb-4"><ErrorBanner message={playersError} /></div>}
      {matchupError && <div className="mb-4"><ErrorBanner message={matchupError} /></div>}

      {/* Loading */}
      {isLoading && !matchupData && (
        <div className="text-center py-12 text-gray-500 text-sm">Loading matchup…</div>
      )}

      {/* Main content */}
      {matchupData && (
        <div className="space-y-5">
          {/* ── Single consolidated card ─────────────────────────────────── */}
          <div className="bg-[#1a1f2e] border border-white/10 rounded-xl p-5 space-y-4">

            {/* Row 1: Period selector + Stat window tabs */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              {/* Period selector — ESPN only (Yahoo doesn't support browsing past periods yet) */}
              {provider === "espn" && matchupData.totalMatchupPeriods > 1 ? (
                <select
                  value={displayedPeriod ?? ""}
                  onChange={(e) => handlePeriodChange(Number(e.target.value))}
                  disabled={matchupLoading}
                  className="bg-[#0f1117] border border-white/15 rounded-lg px-3 py-1.5 text-sm text-gray-300 focus:outline-none focus:border-white/30 disabled:opacity-50 cursor-pointer"
                >
                  {Array.from({ length: matchupData.totalMatchupPeriods }, (_, i) => {
                    const p = matchupData.totalMatchupPeriods - i;
                    const isCurrent = p === matchupData.currentMatchupPeriodId;
                    return (
                      <option key={p} value={p}>
                        Matchup {p}{isCurrent ? " (Current)" : ""}
                      </option>
                    );
                  })}
                </select>
              ) : (
                <div className="text-sm text-gray-500">
                  Matchup {displayedPeriod}
                </div>
              )}

              <StatsWindowTabs
                value={statsWindow}
                onChange={(w) => { if (hasCalculated) shouldScrollRef.current = true; setStatsWindow(w); }}
                availableWindows={provider === "yahoo" ? ["season", "30", "14", "7"] : sportConfig.availableWindows}
                size="md"
              />
            </div>

            {/* Row 2: Team selectors */}
            {allTeams.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <TeamSelector
                  teams={allTeams}
                  value={selectedMyTeamId}
                  onChange={setSelectedMyTeamId}
                  label="Your Team"
                />
                <TeamSelector
                  teams={opponentTeams}
                  value={selectedOpponentId}
                  onChange={setSelectedOpponentId}
                  label="Opponent"
                />
              </div>
            )}

            {/* Divider */}
            <div className="border-t border-white/10" />

            {/* Row 3: Mode toggle (hidden for past matchups) */}
            {isPastMatchup ? (
              <div>
                <span className="text-sm font-medium text-gray-400">Matchup Score</span>
                <p className="text-xs text-gray-500 mt-0.5">Final accumulated stats for this matchup</p>
              </div>
            ) : (
              <div>
                <div className="flex gap-2 flex-wrap mb-2">
                  {(["rest", "projected"] as MatchupMode[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => { if (hasCalculated) shouldScrollRef.current = true; setMode(m); }}
                      className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        mode === m
                          ? "bg-[#e8193c] text-white"
                          : "text-gray-400 hover:text-white border border-white/10 hover:border-white/20"
                      }`}
                    >
                      {MODE_LABELS[m]}
                    </button>
                  ))}
                </div>
                {mode === "projected" ? (
                  <p className="text-xs text-gray-500">
                    {matchupData.daysRemaining > 0
                      ? `Actual stats accumulated so far + projected remaining games based on current roster (excl. IR) · ${matchupData.daysRemaining} day${matchupData.daysRemaining === 1 ? "" : "s"} left`
                      : "Based on actual final matchup stats (matchup complete)"}
                  </p>
                ) : (
                  <p className="text-xs text-gray-500">
                    Projected totals for the remaining days of this matchup based on current roster (excl. IR)
                    {matchupData.daysRemaining > 0
                      ? ` · ${matchupData.daysRemaining} day${matchupData.daysRemaining === 1 ? "" : "s"} left`
                      : ""}
                  </p>
                )}
              </div>
            )}

            {/* Calculate button */}
            {matchupData && !isPastMatchup && (
              <div className="flex justify-end">
                <button
                  onClick={() => { shouldScrollRef.current = true; setHasCalculated(true); setCalculateCount((c) => c + 1); }}
                  disabled={isLoading}
                  className="bg-[#e8193c] hover:bg-[#c41234] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold px-6 py-1.5 rounded-lg text-sm transition-colors"
                >
                  {isLoading ? "Loading…" : "Calculate"}
                </button>
              </div>
            )}
          </div>

          {/* Loading player projections (not needed for past matchups) */}
          {hasCalculated && isLoading && !isPastMatchup && (
            <div className="text-center py-6 text-gray-500 text-sm">Loading player projections…</div>
          )}

          {/* Results */}
          {hasCalculated && myStats && (
            <div ref={resultsRef} className="space-y-4 scroll-mt-14">
              {/* Scoring config label */}
              <p className="text-center text-xs text-gray-600">
                {sportConfig.name} · {scoringConfigLabel(scoringConfig)}
              </p>

              {/* Quick stat window selector */}
              {!isPastMatchup && (
                <div className="flex flex-col items-center gap-1">
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-500 shrink-0">Stats window:</span>
                    <StatsWindowTabs
                      value={statsWindow}
                      onChange={setStatsWindow}
                      availableWindows={provider === "yahoo" ? ["season", "30", "14", "7"] : sportConfig.availableWindows}
                    />
                  </div>
                  {/* Mode description note */}
                  {mode === "projected" ? (
                    <p className="text-xs text-gray-600">
                      {matchupData && matchupData.daysRemaining > 0
                        ? `Projected Score · Actual stats accumulated so far + projected remaining games (excl. IR) · ${matchupData.daysRemaining} day${matchupData.daysRemaining === 1 ? "" : "s"} left`
                        : "Projected Score · Based on actual final matchup stats (matchup complete)"}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-600">
                      Rest of Matchup · Projected totals for remaining games based on current roster (excl. IR)
                      {matchupData && matchupData.daysRemaining > 0
                        ? ` · ${matchupData.daysRemaining} day${matchupData.daysRemaining === 1 ? "" : "s"} left`
                        : ""}
                    </p>
                  )}
                </div>
              )}
              {scoringConfig.format === "roto" ? (
                <div className="bg-[#1a1f2e] border border-white/10 rounded-xl p-5">
                  <RotoProjection myStats={myStats} myName={myTeamName} scoringConfig={scoringConfig} />
                </div>
              ) : hasBye ? (
                /* Bye week — own team projection only */
                <div className="bg-[#1a1f2e] border border-white/10 rounded-xl p-5">
                  <div className="mb-3 text-center text-gray-400 text-sm">
                    Your projected week totals (no opponent this week — pick one above to compare)
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-gray-500 text-xs uppercase border-b border-white/10">
                          <th className="text-center py-2 px-3 font-medium">Category</th>
                          <th className="text-center py-2 px-3 font-medium">{myTeamName}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scoringConfig.cats.map((cat) => (
                          <tr key={cat.id} className="border-b border-white/5">
                            <td className="py-2 px-3 text-center font-medium text-white">{cat.id}</td>
                            <td className="py-2 px-3 text-center font-mono text-gray-300">
                              {fmt(myStats[cat.id] ?? 0, cat.id)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : scoringConfig.format === "points" ? (
                /* H2H Points */
                oppStats && (
                  <PointsMatchup myStats={myStats} oppStats={oppStats} myName={myTeamName} oppName={oppTeamName} />
                )
              ) : (
                /* H2H Categories */
                analysis && (
                  <>
                    <VerdictBanner
                      type="matchup"
                      teamAName={myTeamName}
                      teamBName={oppTeamName}
                      teamAWins={myWins}
                      teamBWins={oppWins}
                      teamALogo={myTeam?.logo}
                      teamBLogo={oppTeam?.logo}
                    />
                    <div className="bg-[#1a1f2e] border border-white/10 rounded-xl overflow-hidden max-w-lg mx-auto w-full">
                      <CategoryTable
                        mode="matchup"
                        results={analysis.results}
                        teamAName={myTeamName}
                        teamBName={oppTeamName}
                      />
                    </div>
                  </>
                )
              )}

              {/* No opponent selected */}
              {!hasBye && !oppStats && !isLoading && (
                <div className="text-center py-6 text-gray-400 text-sm">
                  Select an opponent above to see the matchup projection.
                </div>
              )}
            </div>
          )}

          {/* Off-season note */}
          {!isLoading && !myStats && league && league.scoringPeriodId === 0 && (
            <div className="text-center py-6 text-gray-500 text-sm">
              No active matchup period — check back during the season.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
