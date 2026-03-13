"use client";

import { redirect } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { useFantasyLeague } from "@/hooks/useFantasyLeague";
import { usePlayers } from "@/hooks/usePlayers";
import { aggregateStats } from "@/lib/stat-calculator";
import { swidMatchesOwner } from "@/lib/swid-parser";
import {
  buildSystemPrompt,
  buildWeeklyPrompt,
  buildDailyPrompt,
  rankFreeAgents,
} from "@/lib/coach-prompts";
import { SPORT_CONFIGS } from "@/lib/sports-config";
import type {
  AggregatedStats,
  CoachAdvice,
  CoachResponse,
  EspnSport,
  FantasyProvider,
  LeagueInfo,
  LeagueScoringConfig,
  PlayerStats,
} from "@/lib/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns today's date string in NY timezone (YYYY-MM-DD). */
function getNYDateStr(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

/**
 * Returns the local-time equivalent of 1:00 AM NY time.
 * Each user sees the time in their own timezone.
 */
function getDailyUpdateTime(): string {
  try {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(now);
    const [h, m] = fmt.split(":").map(Number);
    let minUntil = 1 * 60 - (h % 24 * 60 + m);
    if (minUntil <= 0) minUntil += 24 * 60;
    const next = new Date(now.getTime() + minUntil * 60 * 1000);
    return next.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "1:00 AM";
  }
}

// ─── Schedule matchup type ────────────────────────────────────────────────────

type ScheduleMatchup = {
  matchupPeriodId: number;
  home: { teamId: number; cumulativeScore?: { scoreByStat?: Record<string, { score: number }> } };
  away?: { teamId: number; cumulativeScore?: { scoreByStat?: Record<string, { score: number }> } }; // undefined for bye weeks
};

/** Compute per-week average category stats for a team from the ESPN matchup schedule. */
function computeMatchupAvgs(
  schedule: ScheduleMatchup[],
  teamId: number,
  fromPeriod: number,
  toPeriodExclusive: number,
  config: LeagueScoringConfig
): { avgs: AggregatedStats; weeks: number } {
  const accum: Record<number, number> = {};
  let weeks = 0;

  for (const m of schedule) {
    const pid = m.matchupPeriodId;
    if (pid < fromPeriod || pid >= toPeriodExclusive) continue;

    for (const side of [m.home, m.away]) {
      if (!side || side.teamId !== teamId) continue;
      const sbs = side.cumulativeScore?.scoreByStat;
      if (!sbs) continue;
      for (const [sidStr, entry] of Object.entries(sbs)) {
        const sid = parseInt(sidStr, 10);
        if (!isNaN(sid)) accum[sid] = (accum[sid] ?? 0) + entry.score;
      }
      weeks++;
    }
  }

  if (weeks === 0) return { avgs: {}, weeks: 0 };

  const avgs: AggregatedStats = {};
  for (const cat of config.cats) {
    avgs[cat.id] = cat.compute(accum, weeks);
  }
  return { avgs, weeks };
}

// ─── Cache helpers ─────────────────────────────────────────────────────────────

function getWeeklyCache(leagueId: string, sport: string, periodId: number, type: "weekly" | "trade"): CoachAdvice | null {
  try {
    const raw = localStorage.getItem(`ai_coach_${type}_v9_${leagueId}_${sport}_${periodId}`);
    if (!raw) return null;
    return JSON.parse(raw) as CoachAdvice;
  } catch { return null; }
}

function getDailyCache(leagueId: string, sport: string): CoachAdvice | null {
  try {
    const raw = localStorage.getItem(`ai_coach_daily_v10_${leagueId}_${sport}_${getNYDateStr()}`);
    if (!raw) return null;
    return JSON.parse(raw) as CoachAdvice;
  } catch { return null; }
}

function setCoachCache(key: string, advice: CoachAdvice): void {
  try { localStorage.setItem(key, JSON.stringify(advice)); } catch { /* QuotaExceeded — skip */ }
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="w-6 h-6 border-2 border-white/10 border-t-[#e8193c] rounded-full animate-spin" />
    </div>
  );
}

// ─── Insights list ────────────────────────────────────────────────────────────

function InsightsList({ insights }: { insights: string[] }) {
  return (
    <ol className="space-y-2.5">
      {insights.map((text, i) => (
        <li key={i} className="flex gap-3 bg-white/4 rounded-lg px-3.5 py-3">
          <span className="w-5 h-5 rounded-full bg-[#e8193c]/20 text-[#e8193c] text-xs flex items-center justify-center font-bold shrink-0 mt-0.5">
            {i + 1}
          </span>
          <div className="text-sm text-gray-200 leading-relaxed [&_strong]:text-white [&_strong]:font-semibold [&_em]:text-sky-400 [&_em]:not-italic [&_em]:font-medium">
            <ReactMarkdown>{text}</ReactMarkdown>
          </div>
        </li>
      ))}
    </ol>
  );
}

// ─── Headshot row (daily card) ────────────────────────────────────────────────

function HeadshotRow({ playerIds, cdnLeague }: { playerIds: number[]; cdnLeague: string }) {
  if (playerIds.length === 0) return null;
  return (
    <div className="flex gap-2 mb-3">
      {playerIds.slice(0, 5).map((id) => (
        <div key={id} className="w-10 h-10 rounded-full bg-white/5 overflow-hidden shrink-0">
          <img
            src={`https://a.espncdn.com/i/headshots/${cdnLeague}/players/full/${id}.png`}
            alt=""
            className="w-full h-full object-cover object-top"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        </div>
      ))}
    </div>
  );
}

// ─── Coach card ───────────────────────────────────────────────────────────────

interface CoachCardProps {
  icon: string;
  title: string;
  description: string;
  updateCadence: string;
  opponentBadge?: string;
  advice: CoachAdvice | null;
  loading: boolean;
  error: string | null;
  showHeadshotRow?: boolean;
  cdnLeague?: string;
}

function CoachCard({
  icon, title, description, updateCadence, opponentBadge, advice, loading, error,
  showHeadshotRow, cdnLeague,
}: CoachCardProps) {
  const lastUpdated = advice?.generatedAt
    ? new Date(advice.generatedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="bg-[#1a1f2e] border border-white/10 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-start px-5 py-3.5 border-b border-white/8">
        <span className="text-base shrink-0 mt-0.5 mr-2.5">{icon}</span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          <p className="text-xs text-gray-500 mt-0.5 leading-snug">{description}</p>
          <p className="text-xs text-gray-600 mt-1">
            {updateCadence}{lastUpdated ? ` · Updated ${lastUpdated}` : ""}
          </p>
        </div>
      </div>

      {/* Opponent badge */}
      {opponentBadge && !loading && (
        <div className="px-5 pt-3 pb-0">
          <span className="inline-block text-xs font-medium text-gray-400 bg-white/5 border border-white/8 rounded-full px-2.5 py-0.5">
            {opponentBadge}
          </span>
        </div>
      )}

      {/* Body */}
      <div className="px-5 py-4">
        {(loading || (!advice && !error)) && <Spinner />}
        {!loading && error && (
          <p className="text-xs text-red-400 text-center py-4">{error}</p>
        )}
        {!loading && !error && advice && (
          <>
            {showHeadshotRow && advice.topPlayerIds && cdnLeague && (
              <HeadshotRow playerIds={advice.topPlayerIds} cdnLeague={cdnLeague} />
            )}
            <InsightsList insights={advice.insights} />
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CoachPage() {
  redirect("/"); // AI Coach temporarily disabled — remove this line to re-enable

  // ESPN credentials
  const [leagueId, setLeagueId] = useState("");
  const [espnS2, setEspnS2]     = useState("");
  const [swid, setSwid]         = useState("");
  const [sport, setSport]       = useState<EspnSport>("fba");
  const [provider, setProvider] = useState<FantasyProvider>("espn");
  const [yahooLeagueKey, setYahooLeagueKey] = useState("");
  const [yahooB, setYahooB]     = useState("");
  const [yahooT, setYahooT]     = useState("");

  // Weekly advice
  const [weeklyAdvice, setWeeklyAdvice]   = useState<CoachAdvice | null>(null);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [weeklyError, setWeeklyError]     = useState<string | null>(null);
  const weeklyBusy = useRef<boolean>(false);

  // Daily advice
  const [dailyAdvice, setDailyAdvice]   = useState<CoachAdvice | null>(null);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyError, setDailyError]     = useState<string | null>(null);
  const dailyBusy = useRef<boolean>(false);

  // Track whether auto-fetch has already been triggered this mount
  const weeklyAutoFetched = useRef(false);
  const dailyAutoFetched  = useRef(false);

  // ── Read settings from localStorage ──────────────────────────────────────

  useEffect(() => {
    function readSettings() {
      const p = (localStorage.getItem("fantasy_provider") as FantasyProvider | null) ?? "espn";
      setProvider(p);
      const storedSport = (localStorage.getItem("espn_sport") as EspnSport | null) ?? "fba";
      const validSport = storedSport in SPORT_CONFIGS ? storedSport : "fba";
      setSport(validSport);
      setLeagueId(
        localStorage.getItem(`espn_leagueId_${validSport}`) ??
        (validSport === "fba" ? (localStorage.getItem("espn_leagueId") ?? "") : "")
      );
      setEspnS2(localStorage.getItem("espn_s2") ?? "");
      setSwid(localStorage.getItem("espn_swid") ?? "");
      setYahooLeagueKey(localStorage.getItem("yahoo_league_key_nba") ?? "");
      setYahooB(localStorage.getItem("yahoo_b") ?? "");
      setYahooT(localStorage.getItem("yahoo_t") ?? "");
    }
    readSettings();
    window.addEventListener("fantasy-settings-changed", readSettings);
    return () => window.removeEventListener("fantasy-settings-changed", readSettings);
  }, []);

  // ── League + player data (provider-aware) ─────────────────────────────────

  const { league, scoringConfig, loading: leagueLoading } = useFantasyLeague({
    provider,
    espn: { leagueId, espnS2, swid, sport },
    yahoo: { leagueKey: yahooLeagueKey, b: yahooB, t: yahooT },
  });
  const { players, loading: playersLoading } = usePlayers(
    leagueId, espnS2, swid, "30", sport, league?.activeLineupSlotIds
  );
  // Extra windows for weekly multi-perspective analysis — all share cached ESPN response
  const { players: playersSeason } = usePlayers(leagueId, espnS2, swid, "season", sport, league?.activeLineupSlotIds);
  const { players: players15d }    = usePlayers(leagueId, espnS2, swid, "15",     sport, league?.activeLineupSlotIds);
  const { players: players7d }     = usePlayers(leagueId, espnS2, swid, "7",      sport, league?.activeLineupSlotIds);
  const { players: playersProj }   = usePlayers(leagueId, espnS2, swid, "proj",   sport, league?.activeLineupSlotIds);

  const sportCfg = SPORT_CONFIGS[sport];
  const cdnLeague = sportCfg?.cdnLeague ?? "nba";
  const dataReady = !!league && players.length > 0 && !!leagueId;

  // windowPlayersRef always holds the latest window player arrays.
  // fetchDailyAdvice reads from here instead of closing over the arrays,
  // so adding more windows never invalidates the callback and re-triggers the auto-fetch.
  const windowPlayersRef = useRef<{ season: PlayerStats[]; p15d: PlayerStats[]; p7d: PlayerStats[] }>({ season: playersSeason, p15d: players15d, p7d: players7d });
  useEffect(() => {
    windowPlayersRef.current = { season: playersSeason, p15d: players15d, p7d: players7d };
  }, [playersSeason, players15d, players7d]);

  // ── AI call helper ────────────────────────────────────────────────────────

  async function callAI(
    adviceType: "weekly" | "daily" | "trade",
    systemPrompt: string,
    userPrompt: string,
    signal?: AbortSignal
  ): Promise<string[]> {
    const res = await fetch("/api/ai/coach", {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adviceType, systemPrompt, userPrompt }),
    });
    const data = (await res.json()) as CoachResponse;
    if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
    return data.insights;
  }

  // ── Matchup finder ────────────────────────────────────────────────────────

  async function fetchMatchupData(
    currentLeague: LeagueInfo,
    currentScoringConfig: LeagueScoringConfig,
    currentPlayers: PlayerStats[]
  ) {
    const myTeam = currentLeague.teams.find((t) => swidMatchesOwner(swid, t.ownerId));
    if (!myTeam) throw new Error("Could not find your team — check that your SWID is correct.");

    const currentPeriod = currentLeague.scoringPeriodId;
    if (currentPeriod === 0) throw new Error("No active matchup period (off-season).");

    // Fetch weekly schedule
    const weeklyRes = await fetch(
      `/api/espn/weekly?leagueId=${encodeURIComponent(leagueId)}&period=${currentPeriod}&sport=${sport}`,
      { headers: { "x-espn-s2": espnS2, "x-espn-swid": swid } }
    );
    if (!weeklyRes.ok) throw new Error("Could not load matchup schedule from ESPN.");
    const weeklyData = (await weeklyRes.json()) as { schedule?: unknown[] };

    const schedule = (weeklyData.schedule ?? []) as ScheduleMatchup[];

    const matchup = schedule.find(
      (m) =>
        m.matchupPeriodId === currentPeriod &&
        (m.home.teamId === myTeam.id || m.away?.teamId === myTeam.id)
    );
    if (!matchup) throw new Error("Could not find your current matchup in the schedule.");

    const opponentId =
      matchup.home.teamId === myTeam.id ? matchup.away?.teamId : matchup.home.teamId;
    const opponentTeam = currentLeague.teams.find((t) => t.id === opponentId);
    const opponentName = opponentTeam?.name ?? "Unknown Opponent";

    // Aggregate roster stats (30d)
    const myRoster = currentPlayers.filter((p) => myTeam.rosterPlayerIds.includes(p.playerId));
    const opponentRoster = currentPlayers.filter(
      (p) => opponentTeam?.rosterPlayerIds.includes(p.playerId)
    );
    const myStats = aggregateStats(myRoster, currentScoringConfig);
    const opponentStats = aggregateStats(opponentRoster, currentScoringConfig);

    return { myTeam, opponentTeam, opponentName, myStats, opponentStats, currentPeriod, schedule };
  }

  // ── Fetch weekly advice ───────────────────────────────────────────────────

  const fetchWeeklyAdvice = useCallback(async (bypassCache = false, signal?: AbortSignal) => {
    if (weeklyBusy.current || !league) return;
    if (provider === "yahoo") {
      setWeeklyError("AI Coach weekly analysis uses ESPN matchup data — switch to ESPN in the navbar.");
      return;
    }
    weeklyBusy.current = true;
    setWeeklyLoading(true);
    setWeeklyError(null);

    try {
      const period = league!.scoringPeriodId;
      if (!bypassCache) {
        const cached = getWeeklyCache(leagueId, sport, period, "weekly");
        if (cached) { setWeeklyAdvice(cached); return; }
      }

      const { myTeam, opponentTeam, opponentName, myStats: myStats30, opponentStats: oppStats30, currentPeriod, schedule } =
        await fetchMatchupData(league!, scoringConfig, players);

      // Season and 15d stats for additional perspectives
      const myRosterSeason  = playersSeason.filter((p) => myTeam.rosterPlayerIds.includes(p.playerId));
      const oppRosterSeason = playersSeason.filter((p) => opponentTeam?.rosterPlayerIds.includes(p.playerId));
      const myRoster15d     = players15d.filter((p) => myTeam.rosterPlayerIds.includes(p.playerId));
      const oppRoster15d    = players15d.filter((p) => opponentTeam?.rosterPlayerIds.includes(p.playerId));
      const myStatsSeason  = aggregateStats(myRosterSeason,  scoringConfig);
      const oppStatsSeason = aggregateStats(oppRosterSeason, scoringConfig);
      const myStats15      = aggregateStats(myRoster15d,     scoringConfig);
      const oppStats15     = aggregateStats(oppRoster15d,    scoringConfig);

      // Full-season matchup averages (all completed weeks)
      const { avgs: myMatchupAvgs, weeks: matchupWeeks } = computeMatchupAvgs(
        schedule, myTeam.id, 1, currentPeriod, scoringConfig
      );
      const { avgs: oppMatchupAvgs } = computeMatchupAvgs(
        schedule, opponentTeam?.id ?? -1, 1, currentPeriod, scoringConfig
      );

      // Recent 3-week matchup averages (last 3 completed matchup periods)
      const recent3From = Math.max(1, currentPeriod - 3);
      const { avgs: myMatchupAvgs3w, weeks: matchupWeeks3w } = computeMatchupAvgs(
        schedule, myTeam.id, recent3From, currentPeriod, scoringConfig
      );
      const { avgs: oppMatchupAvgs3w } = computeMatchupAvgs(
        schedule, opponentTeam?.id ?? -1, recent3From, currentPeriod, scoringConfig
      );

      // Projections — fallback for early season when matchup history is thin
      const myRosterProj  = playersProj.filter((p) => myTeam.rosterPlayerIds.includes(p.playerId));
      const oppRosterProj = playersProj.filter((p) => opponentTeam?.rosterPlayerIds.includes(p.playerId));
      const myStatsProj   = aggregateStats(myRosterProj,  scoringConfig);
      const oppStatsProj  = aggregateStats(oppRosterProj, scoringConfig);

      const systemPrompt = buildSystemPrompt("weekly");
      const userPrompt = buildWeeklyPrompt({
        sportName: sportCfg.name,
        scoringConfig,
        myTeamName: myTeam.name,
        opponentName,
        myStats30,
        oppStats30,
        myStatsSeason,
        oppStatsSeason,
        myStats15,
        oppStats15,
        myMatchupAvgs,
        oppMatchupAvgs,
        matchupWeeks,
        myMatchupAvgs3w,
        oppMatchupAvgs3w,
        matchupWeeks3w,
        myStatsProj,
        oppStatsProj,
      });

      const insights = await callAI("weekly", systemPrompt, userPrompt, signal);
      const advice: CoachAdvice = {
        type: "weekly",
        insights,
        generatedAt: new Date().toISOString(),
        matchupPeriodId: currentPeriod,
        opponentName,
      };
      setCoachCache(`ai_coach_weekly_v9_${leagueId}_${sport}_${currentPeriod}`, advice);
      setWeeklyAdvice(advice);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setWeeklyError((err as Error).message);
    } finally {
      setWeeklyLoading(false);
      weeklyBusy.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league, players, playersSeason, players15d, playersProj, scoringConfig, leagueId, sport, espnS2, swid, provider]);

  // ── Fetch daily advice ────────────────────────────────────────────────────

  const fetchDailyAdvice = useCallback(async (bypassCache = false, signal?: AbortSignal) => {
    if (dailyBusy.current || !league) return;
    if (provider === "yahoo") {
      setDailyError("AI Coach daily analysis uses ESPN schedule data — switch to ESPN in the navbar.");
      return;
    }
    dailyBusy.current = true;
    setDailyLoading(true);
    setDailyError(null);

    try {
      if (!bypassCache) {
        const cached = getDailyCache(leagueId, sport);
        if (cached) { setDailyAdvice(cached); return; }
      }

      // Fetch league with schedule view for game counts
      const leagueRes = await fetch(
        `/api/espn/league?leagueId=${encodeURIComponent(leagueId)}&sport=${sport}&schedule=1`,
        { headers: { "x-espn-s2": espnS2, "x-espn-swid": swid } }
      );
      const leagueWithSchedule = leagueRes.ok
        ? ((await leagueRes.json()) as Record<string, unknown>)
        : null;

      const proTeamSchedules = (leagueWithSchedule?.proTeamSchedules ?? {}) as Record<
        string,
        { proGamesByScoringPeriod?: Record<string, Array<{ date?: number }>> }
      >;

      const { myTeam, opponentName, myStats, opponentStats, currentPeriod } =
        await fetchMatchupData(league!, scoringConfig, players);

      // Build owned IDs from raw ESPN roster data (includes ALL lineup slots — IR, bench, etc.)
      // This is more accurate than league.teams[].rosterPlayerIds which strips IR players.
      const rawTeams = (leagueWithSchedule?.teams ?? []) as Array<{
        roster?: { entries?: Array<{ playerId?: number; id?: number }> };
      }>;
      const ownedIds =
        rawTeams.length > 0
          ? new Set<number>(
              rawTeams.flatMap((t) =>
                (t.roster?.entries ?? [])
                  .map((e) => e.playerId ?? e.id)
                  .filter((id): id is number => typeof id === "number")
              )
            )
          : new Set<number>(league!.teams.flatMap((t) => t.rosterPlayerIds)); // fallback
      const INACTIVE_STATUSES = new Set(["OUT", "INJURY_RESERVE", "DOUBTFUL", "DAY_TO_DAY"]);
      const freeAgents = players.filter(
        (p) => !ownedIds.has(p.playerId) && !INACTIVE_STATUSES.has(p.injuryStatus ?? "")
      );
      const myRosterPlayers = players.filter((p) => myTeam.rosterPlayerIds.includes(p.playerId));

      // Detect which pro teams have a game today (NY timezone = NBA game calendar).
      // Primary: match each game's date field against today's NY date.
      // ESPN may send epoch-ms (13 digits) or epoch-s (10 digits) — handle both.
      // Fallback: if date matching finds nothing, use period-key presence instead.
      const nyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" });
      const todayNY = nyFmt.format(new Date());
      const proTeamsWithRelevantGame = new Set<string>();

      for (const [proTeamId, teamData] of Object.entries(proTeamSchedules)) {
        let found = false;
        outer: for (const games of Object.values(teamData.proGamesByScoringPeriod ?? {})) {
          for (const game of games) {
            if (game.date == null) continue;
            // Normalize: values < 1e11 are likely epoch-seconds, convert to ms
            const ts = game.date > 1e11 ? game.date : game.date * 1000;
            if (nyFmt.format(new Date(ts)) === todayNY) { found = true; break outer; }
          }
        }
        if (found) proTeamsWithRelevantGame.add(proTeamId);
      }

      // Fallback: date field missing or never matched — use scoring-period key presence.
      // Try currentPeriod-1 first (ESPN often advances scoringPeriodId to tomorrow),
      // then currentPeriod. Stop once we find a period with games for 3+ teams.
      if (proTeamsWithRelevantGame.size === 0) {
        for (const p of [String(currentPeriod - 1), String(currentPeriod)]) {
          for (const [proTeamId, teamData] of Object.entries(proTeamSchedules)) {
            if ((teamData.proGamesByScoringPeriod?.[p]?.length ?? 0) > 0)
              proTeamsWithRelevantGame.add(proTeamId);
          }
          if (proTeamsWithRelevantGame.size > 3) break;
          proTeamsWithRelevantGame.clear(); // not enough teams — try next period
        }
      }

      // Rank free agents by matchup relevance
      const ranked = rankFreeAgents(freeAgents, myStats, opponentStats, scoringConfig);

      // Multi-window lookup maps — read from ref so latest data is always used
      // even when playersSeason/players15d/players7d haven't yet loaded at callback creation time.
      const { season: wSeason, p15d: w15d, p7d: w7d } = windowPlayersRef.current;
      const seasonMap = new Map(wSeason.map((p) => [p.playerId, p]));
      const map15d    = new Map(w15d.map((p)   => [p.playerId, p]));
      const map7d     = new Map(w7d.map((p)    => [p.playerId, p]));

      // Attach game counts + relevant-game flag + all stat windows
      const rankedWithGames = ranked.slice(0, 25).map((p) => {
        const proTeamId = p.teamAbbrev;
        const gamesThisWeek =
          proTeamSchedules[proTeamId]?.proGamesByScoringPeriod?.[String(currentPeriod)]?.length ?? undefined;
        const hasRelevantGame = proTeamsWithRelevantGame.has(String(proTeamId));
        const windows: Partial<Record<string, PlayerStats>> = { "30d": p };
        const sp  = seasonMap.get(p.playerId);
        const p15 = map15d.get(p.playerId);
        const p7  = map7d.get(p.playerId);
        if (sp)  windows["season"] = sp as PlayerStats;
        if (p15) windows["15d"]    = p15 as PlayerStats;
        if (p7)  windows["7d"]     = p7 as PlayerStats;
        return { ...p, gamesThisWeek, hasRelevantGame, windows };
      });
      // Sort: players with an upcoming game first, then by matchup ranking
      rankedWithGames.sort((a, b) => {
        if (a.hasRelevantGame !== b.hasRelevantGame) return a.hasRelevantGame ? -1 : 1;
        return 0;
      });

      const systemPrompt = buildSystemPrompt("daily");
      const userPrompt = buildDailyPrompt({
        sportName: sportCfg.name,
        sport,
        scoringConfig,
        myTeamName: myTeam.name,
        myRoster: myRosterPlayers.map((p) => ({ name: p.playerName, position: p.position })),
        myStats,
        opponentName,
        opponentStats,
        freeAgents: rankedWithGames,
      });

      const insights = await callAI("daily", systemPrompt, userPrompt, signal);

      // Extract top player IDs by scanning insight text for FA names
      const topPlayerIds: number[] = [];
      const seenIds = new Set<number>();
      for (const insight of insights) {
        if (topPlayerIds.length >= 5) break;
        for (const fa of rankedWithGames) {
          if (seenIds.has(fa.playerId)) continue;
          // Match player name (handle bold markdown wrapping)
          const plainName = fa.playerName.toLowerCase();
          if (insight.toLowerCase().includes(plainName)) {
            topPlayerIds.push(fa.playerId);
            seenIds.add(fa.playerId);
          }
        }
      }

      const advice: CoachAdvice = {
        type: "daily",
        insights,
        generatedAt: new Date().toISOString(),
        opponentName,
        topPlayerIds: topPlayerIds.length > 0 ? topPlayerIds : undefined,
      };
      setCoachCache(`ai_coach_daily_v10_${leagueId}_${sport}_${getNYDateStr()}`, advice);
      setDailyAdvice(advice);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setDailyError((err as Error).message);
    } finally {
      setDailyLoading(false);
      (dailyBusy as { current: boolean }).current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league, players, scoringConfig, leagueId, sport, espnS2, swid, provider]); // window arrays accessed via ref — omitted intentionally

  // ── Stable refs so the sequential effect never re-fires due to callback identity changes ──
  // fetchWeeklyAdvice / fetchDailyAdvice recreate when player arrays load (players7d etc.),
  // which would abort the controller mid-sequence and leave daily stuck. Using refs fixes this.
  const fetchWeeklyRef = useRef(fetchWeeklyAdvice);
  const fetchDailyRef  = useRef(fetchDailyAdvice);
  useEffect(() => { fetchWeeklyRef.current = fetchWeeklyAdvice; }, [fetchWeeklyAdvice]);
  useEffect(() => { fetchDailyRef.current  = fetchDailyAdvice;  }, [fetchDailyAdvice]);

  // ── Auto-fetch on mount (weekly → daily, strictly sequential) ───────────────
  // Only re-fires when the league / sport changes, not on every player-data reload.

  useEffect(() => {
    if (!dataReady || weeklyAutoFetched.current) return;
    weeklyAutoFetched.current = true;
    dailyAutoFetched.current  = true;

    const period = league!.scoringPeriodId;
    const controller = new AbortController();
    const { signal } = controller;

    async function runSequential() {
      // Weekly — serve from cache instantly if available (v2 keys)
      const wCached = getWeeklyCache(leagueId, sport, period, "weekly");
      if (wCached) setWeeklyAdvice(wCached);
      else await fetchWeeklyRef.current(false, signal);

      if (signal.aborted) return; // user navigated away

      // Daily — only starts after weekly fully completes
      const dCached = getDailyCache(leagueId, sport);
      if (dCached) setDailyAdvice(dCached);
      else await fetchDailyRef.current(false, signal);
    }

    runSequential();
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataReady, leagueId, sport]); // league/fetchXxx deliberately omitted — captured via refs above

  // ── Render ────────────────────────────────────────────────────────────────

  const hasEspnCreds = !!(leagueId && espnS2 && swid);
  const isOffSeason = league?.scoringPeriodId === 0;
  const isLoading = leagueLoading || playersLoading;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
      <div className="mb-2">
        <h1 className="text-xl font-bold text-white">AI Coach</h1>
      </div>

      {/* ESPN not connected */}
      {!hasEspnCreds && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 text-sm text-amber-300">
          Connect your ESPN league in{" "}
          <Link href="/settings" className="underline hover:text-amber-200">Settings</Link>{" "}
          to enable AI Coach.
        </div>
      )}

      {/* Loading ESPN data */}
      {hasEspnCreds && isLoading && !league && (
        <div className="flex items-center gap-3 text-sm text-gray-500 py-4">
          <div className="w-4 h-4 border-2 border-white/10 border-t-[#e8193c] rounded-full animate-spin shrink-0" />
          Loading league data…
        </div>
      )}

      {/* Off-season banner */}
      {isOffSeason && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-300">
          {sportCfg?.name} is in off-season — weekly and daily advice require an active matchup.
        </div>
      )}

      {/* Advice cards */}
      {hasEspnCreds && (
        <>
          <CoachCard
            icon="📅"
            title="Weekly Matchup"
            description="5 strategic insights for your current H2H matchup — categories to attack, categories to protect, and key roster moves."
            updateCadence="Updates every matchup period"
            opponentBadge={weeklyAdvice?.opponentName ? `This week vs ${weeklyAdvice?.opponentName}` : undefined}
            advice={isOffSeason ? null : weeklyAdvice}
            loading={weeklyLoading}
            error={isOffSeason ? null : weeklyError}
          />

          <CoachCard
            icon="📋"
            title="Daily Pickups"
            description="5 waiver wire recommendations for free agents who can boost your matchup, prioritizing players with games today or tomorrow."
            updateCadence={`Updates daily at ${getDailyUpdateTime()}`}
            opponentBadge={dailyAdvice?.opponentName ? `vs ${dailyAdvice?.opponentName}` : undefined}
            advice={isOffSeason ? null : dailyAdvice}
            loading={dailyLoading}
            error={isOffSeason ? null : dailyError}
            showHeadshotRow
            cdnLeague={cdnLeague}
          />

        </>
      )}
    </div>
  );
}
