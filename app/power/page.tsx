"use client";

import { Fragment, useState, useEffect, useCallback } from "react";
import { useLeague } from "@/hooks/useLeague";
import { calcTradeScore } from "@/lib/trade-score";
import { fmt } from "@/lib/stat-calculator";
import { cacheGet, cacheSet, cacheKey } from "@/lib/espn-cache";
import type { AggregatedStats, PowerMatchup, PowerRankEntry } from "@/lib/types";
import { WeekRangePicker } from "@/components/WeekRangePicker";
import { ErrorBanner } from "@/components/ErrorBanner";
import Link from "next/link";

function splitName(name: string): string[] {
  const idx = name.indexOf(" ");
  return idx === -1 ? [name] : [name.slice(0, idx), name.slice(idx + 1)];
}

function MatchupTooltip({
  teamName, opponentName, teamStats, oppStats, anchorLeft, anchorBottom,
}: {
  teamName: string; opponentName: string;
  teamStats: AggregatedStats; oppStats: AggregatedStats;
  anchorLeft: number; anchorBottom: number;
}) {
  const catResults = calcTradeScore(teamStats, oppStats).results;
  return (
    <div
      style={{ position: "fixed", left: anchorLeft, bottom: anchorBottom, zIndex: 100 }}
      className="bg-[#0f1117] border border-white/20 rounded-lg shadow-2xl overflow-hidden pointer-events-none"
    >
      <table className="text-xs border-separate border-spacing-0">
        <thead>
          <tr className="border-b border-white/10">
            {/* name sits in the exact same column as the value data below it */}
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
          {/* thin separator so header feels attached to data */}
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
                    : <span className="text-gray-700">–</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

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

interface RankedEntry extends PowerRankEntry {
  rank: number;
}

export default function PowerPage() {
  const [leagueId, setLeagueId] = useState("");
  const [espnS2, setEspnS2] = useState("");
  const [swid, setSwid] = useState("");

  const [startPeriod, setStartPeriod] = useState(1);
  const [endPeriod, setEndPeriod] = useState(1);

  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rankings, setRankings] = useState<RankedEntry[] | null>(null);

  const [teamStatsMap, setTeamStatsMap] = useState<Record<number, AggregatedStats> | null>(null);
  const [hoveredMatchup, setHoveredMatchup] = useState<{
    teamId: number; opponentId: number;
    teamName: string; opponentName: string;
    anchorLeft: number; anchorBottom: number;
  } | null>(null);

  const [expandedTeamId, setExpandedTeamId] = useState<number | null>(null);
  const [expandedType, setExpandedType] = useState<"W" | "L" | "T" | null>(null);

  useEffect(() => {
    setLeagueId(localStorage.getItem("espn_leagueId") ?? "");
    setEspnS2(localStorage.getItem("espn_s2") ?? "");
    setSwid(localStorage.getItem("espn_swid") ?? "");
  }, []);

  const { league, loading: leagueLoading, error: leagueError } = useLeague(leagueId, espnS2, swid);

  // Init week range to last completed week
  useEffect(() => {
    if (!league) return;
    const lastCompleted = Math.max(1, league.scoringPeriodId - 1);
    setEndPeriod(lastCompleted);
    setStartPeriod(lastCompleted);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league?.leagueId]);

  // Reset results when range changes
  useEffect(() => { setRankings(null); setTeamStatsMap(null); }, [startPeriod, endPeriod]);

  const handleCalculate = useCallback(async () => {
    if (!leagueId || !espnS2 || !swid || !league) return;
    setCalculating(true);
    setError(null);
    setRankings(null);
    setTeamStatsMap(null);
    setExpandedTeamId(null);
    setExpandedType(null);

    try {
      // Fetch full-season mMatchup schedule (same cache key as compare page)
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

      // Build per-team accumulators for ALL teams in the league
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

            const get = (id: number) => sbs[String(id)]?.score ?? 0;
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

      // Verify we got data for at least one team
      const totalWeeks = Array.from(accumMap.values()).reduce((s, a) => s + a.weeks, 0);
      if (totalWeeks === 0) {
        throw new Error(
          "No matchup data found for the selected week range. " +
          "Future weeks or weeks beyond the schedule won't have stats yet."
        );
      }

      // Compute averaged stats per team
      const statsMap: Record<number, AggregatedStats> = {};
      for (const team of league.teams) {
        statsMap[team.id] = accumToStats(accumMap.get(team.id)!);
      }

      // Initialize rank entries
      const entriesMap = new Map<number, PowerRankEntry>();
      for (const team of league.teams) {
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

      // Full round-robin
      const teams = league.teams;
      for (let i = 0; i < teams.length; i++) {
        for (let j = i + 1; j < teams.length; j++) {
          const teamA = teams[i];
          const teamB = teams[j];
          // calcTradeScore(giving=A, receiving=B)
          // losses = cats A won, winsForReceiving = cats B won
          const result = calcTradeScore(statsMap[teamA.id], statsMap[teamB.id]);
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

      // Compute win% for each entry
      const entries = Array.from(entriesMap.values());
      for (const entry of entries) {
        const total = entry.wins + entry.losses + entry.ties;
        entry.winPct = total > 0 ? ((entry.wins + 0.5 * entry.ties) / total) * 100 : 0;
      }

      // Primary sort: wins desc → losses asc → winPct desc
      entries.sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (a.losses !== b.losses) return a.losses - b.losses;
        return b.winPct - a.winPct;
      });

      // Assign ranks; tied groups share a rank, sorted within by head-to-head
      const ranked: RankedEntry[] = [];
      let idx = 0;
      while (idx < entries.length) {
        // Find end of tied group (same W-L-T)
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

        // Sort within tied group by head-to-head: winner goes first
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

      setTeamStatsMap(statsMap);
      setRankings(ranked);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCalculating(false);
    }
  }, [leagueId, espnS2, swid, startPeriod, endPeriod, league]);

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

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Power Rankings</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Full round-robin — every team vs every other team, based on averaged stats across the selected week range
        </p>
      </div>

      {noSettings && (
        <div className="mb-6 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 text-sm text-yellow-300">
          Set your credentials in{" "}
          <Link href="/settings" className="underline hover:text-yellow-200">Settings</Link> first.
        </div>
      )}

      {leagueError && <div className="mb-6"><ErrorBanner message={leagueError} /></div>}
      {error && <div className="mb-6"><ErrorBanner message={error} onRetry={handleCalculate} /></div>}
      {leagueLoading && <div className="text-center py-8 text-gray-500 text-sm">Loading league…</div>}

      {hoveredMatchup && teamStatsMap && (
        <MatchupTooltip
          teamName={hoveredMatchup.teamName}
          opponentName={hoveredMatchup.opponentName}
          teamStats={teamStatsMap[hoveredMatchup.teamId]}
          oppStats={teamStatsMap[hoveredMatchup.opponentId]}
          anchorLeft={hoveredMatchup.anchorLeft}
          anchorBottom={hoveredMatchup.anchorBottom}
        />
      )}

      {league && !leagueLoading && (
        <>
          <div className="bg-[#1a1f2e] border border-white/10 rounded-xl p-6 mb-6">
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
            <div className="mt-6 flex justify-end">
              <button
                onClick={handleCalculate}
                disabled={calculating}
                className="bg-[#e8193c] hover:bg-[#c41234] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold px-8 py-2.5 rounded-lg transition-colors"
              >
                {calculating ? "Calculating…" : "Calculate"}
              </button>
            </div>
          </div>

          {rankings && (
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
        </>
      )}
    </div>
  );
}
