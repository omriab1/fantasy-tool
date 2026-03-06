"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { useLeague } from "@/hooks/useLeague";
import { usePlayers } from "@/hooks/usePlayers";
import { aggregateStats } from "@/lib/stat-calculator";
import { swidMatchesOwner } from "@/lib/swid-parser";
import {
  buildSystemPrompt,
  buildWeeklyPrompt,
  buildDailyPrompt,
  buildTradePrompt,
  rankFreeAgents,
} from "@/lib/coach-prompts";
import { AI_PROVIDERS, AI_PROVIDER_LABELS, AI_DEFAULT_MODELS, AI_PROVIDER_FULL_URLS, AI_PROVIDER_DESCRIPTIONS } from "@/lib/ai-providers";
import { SPORT_CONFIGS } from "@/lib/sports-config";
import { ErrorBanner } from "@/components/ErrorBanner";
import type {
  AIProvider,
  CoachAdvice,
  CoachResponse,
  EspnSport,
  LeagueInfo,
  LeagueScoringConfig,
  PlayerStats,
} from "@/lib/types";

// ─── Cache helpers ─────────────────────────────────────────────────────────────

function getWeeklyCache(leagueId: string, sport: string, periodId: number, type: "weekly" | "trade"): CoachAdvice | null {
  try {
    const raw = localStorage.getItem(`ai_coach_${type}_${leagueId}_${sport}_${periodId}`);
    if (!raw) return null;
    return JSON.parse(raw) as CoachAdvice;
  } catch { return null; }
}

function getDailyCache(leagueId: string, sport: string): CoachAdvice | null {
  try {
    const today = new Date().toISOString().split("T")[0];
    const raw = localStorage.getItem(`ai_coach_daily_${leagueId}_${sport}_${today}`);
    if (!raw) return null;
    return JSON.parse(raw) as CoachAdvice;
  } catch { return null; }
}

function setCoachCache(key: string, advice: CoachAdvice): void {
  try { localStorage.setItem(key, JSON.stringify(advice)); } catch { /* QuotaExceeded — skip */ }
}

// ─── Inline AI setup (shown when no API key is configured) ────────────────────

function InlineAISetup({ onSave }: { onSave: (provider: AIProvider, key: string) => void }) {
  const [provider, setProvider] = useState<AIProvider>("openai");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  function handleSave() {
    if (!apiKey.trim()) return;
    localStorage.setItem("ai_provider", provider);
    localStorage.setItem("ai_api_key", apiKey.trim());
    window.dispatchEvent(new Event("espn-settings-changed"));
    onSave(provider, apiKey.trim());
  }

  return (
    <div className="bg-[#1a1f2e] border border-white/10 rounded-xl overflow-hidden mb-2">
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/8">
        <p className="text-sm font-semibold text-white">Connect AI Provider</p>
        <p className="text-xs text-gray-500 mt-0.5">
          One-time setup — your key is saved in your browser.{" "}
          <Link href="/settings" className="text-gray-400 hover:text-white underline">Full settings →</Link>
        </p>
      </div>

      <div className="px-5 py-4 flex flex-col gap-4">
        {/* Step 1: Pick provider */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Step 1 — Choose a provider
          </p>
          <div className="flex flex-col gap-2">
            {AI_PROVIDERS.map((p) => (
              <button
                key={p}
                onClick={() => setProvider(p)}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm border transition-colors text-left ${
                  provider === p
                    ? "bg-[#e8193c]/10 border-[#e8193c]/50 text-white"
                    : "border-white/8 text-gray-400 hover:text-white hover:border-white/15"
                }`}
              >
                <span className="font-medium">{AI_PROVIDER_LABELS[p]}</span>
                <span className={`text-xs ${provider === p ? "text-gray-400" : "text-gray-600"}`}>
                  {AI_PROVIDER_DESCRIPTIONS[p]}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Step 2: Get key */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Step 2 — Get your API key
          </p>
          <a
            href={AI_PROVIDER_FULL_URLS[provider]}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-white/10 text-sm text-gray-300 hover:text-white hover:border-white/25 transition-colors"
          >
            <span>🔑</span>
            <span>Open {AI_PROVIDER_LABELS[provider]} API keys page</span>
            <span className="ml-auto text-gray-600 text-xs">↗</span>
          </a>
          <p className="text-xs text-gray-600 mt-1.5 pl-1">
            Sign in → create a new key → copy it → paste below
          </p>
        </div>

        {/* Step 3: Paste and save */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Step 3 — Paste and save
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
                placeholder="Paste your API key here…"
                className="w-full bg-[#0f1117] border border-white/10 rounded-lg px-3 py-2 pr-14 text-sm text-white font-mono placeholder-gray-600 focus:outline-none focus:border-[#e8193c]/60"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-600 hover:text-gray-400 transition-colors"
              >
                {showKey ? "Hide" : "Show"}
              </button>
            </div>
            <button
              onClick={handleSave}
              disabled={!apiKey.trim()}
              className="bg-[#e8193c] hover:bg-[#c41234] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors shrink-0"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
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
          <div className="text-sm text-gray-200 leading-relaxed [&_strong]:text-white [&_strong]:font-semibold">
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
  onRefresh: () => void;
  showHeadshotRow?: boolean;
  cdnLeague?: string;
}

function CoachCard({
  icon, title, description, updateCadence, opponentBadge, advice, loading, error, onRefresh,
  showHeadshotRow, cdnLeague,
}: CoachCardProps) {
  const lastUpdated = advice?.generatedAt
    ? new Date(advice.generatedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="bg-[#1a1f2e] border border-white/10 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between px-5 py-3.5 border-b border-white/8">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="text-base shrink-0 mt-0.5">{icon}</span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-white">{title}</h2>
            <p className="text-xs text-gray-500 mt-0.5 leading-snug">{description}</p>
            <p className="text-xs text-gray-600 mt-1">
              {lastUpdated ? `Updated ${lastUpdated}` : updateCadence}
            </p>
          </div>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="shrink-0 ml-3 text-xs text-gray-500 hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed border border-white/10 hover:border-white/20 px-2.5 py-1 rounded-md transition-colors mt-0.5"
        >
          {loading ? "…" : "Refresh"}
        </button>
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
        {loading && <Spinner />}
        {!loading && error && <ErrorBanner message={error} onRetry={onRefresh} />}
        {!loading && !error && !advice && (
          <p className="text-sm text-gray-600 text-center py-4">Fetching advice…</p>
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
  // ESPN credentials
  const [leagueId, setLeagueId] = useState("");
  const [espnS2, setEspnS2]     = useState("");
  const [swid, setSwid]         = useState("");
  const [sport, setSport]       = useState<EspnSport>("fba");

  // AI settings
  const [aiProvider, setAiProvider] = useState<AIProvider>("openai");
  const [aiApiKey, setAiApiKey]     = useState("");
  const [aiModel, setAiModel]       = useState("");

  // Weekly advice
  const [weeklyAdvice, setWeeklyAdvice]   = useState<CoachAdvice | null>(null);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [weeklyError, setWeeklyError]     = useState<string | null>(null);
  const weeklyBusy = useRef(false);

  // Daily advice
  const [dailyAdvice, setDailyAdvice]   = useState<CoachAdvice | null>(null);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyError, setDailyError]     = useState<string | null>(null);
  const dailyBusy = useRef(false);

  // Trade advice
  const [tradeAdvice, setTradeAdvice]   = useState<CoachAdvice | null>(null);
  const [tradeLoading, setTradeLoading] = useState(false);
  const [tradeError, setTradeError]     = useState<string | null>(null);
  const tradeBusy = useRef(false);

  // Track whether auto-fetch has already been triggered this mount
  const weeklyAutoFetched = useRef(false);
  const dailyAutoFetched  = useRef(false);
  const tradeAutoFetched  = useRef(false);

  // ── Read settings from localStorage ──────────────────────────────────────

  useEffect(() => {
    function readSettings() {
      const storedSport = (localStorage.getItem("espn_sport") as EspnSport | null) ?? "fba";
      const validSport = storedSport in SPORT_CONFIGS ? storedSport : "fba";
      setSport(validSport);
      setLeagueId(
        localStorage.getItem(`espn_leagueId_${validSport}`) ??
        (validSport === "fba" ? (localStorage.getItem("espn_leagueId") ?? "") : "")
      );
      setEspnS2(localStorage.getItem("espn_s2") ?? "");
      setSwid(localStorage.getItem("espn_swid") ?? "");
      setAiProvider((localStorage.getItem("ai_provider") as AIProvider | null) ?? "openai");
      setAiApiKey(localStorage.getItem("ai_api_key") ?? "");
      setAiModel(localStorage.getItem("ai_model") ?? "");
    }
    readSettings();
    window.addEventListener("espn-settings-changed", readSettings);
    return () => window.removeEventListener("espn-settings-changed", readSettings);
  }, []);

  // ── ESPN data ─────────────────────────────────────────────────────────────

  const { league, scoringConfig, loading: leagueLoading } = useLeague(leagueId, espnS2, swid, sport);
  const { players, loading: playersLoading } = usePlayers(
    leagueId, espnS2, swid, "30", sport, league?.activeLineupSlotIds
  );

  const sportCfg = SPORT_CONFIGS[sport];
  const cdnLeague = sportCfg?.cdnLeague ?? "nba";
  const dataReady = !!league && players.length > 0 && !!aiApiKey && !!leagueId;

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
      body: JSON.stringify({
        provider: aiProvider,
        apiKey: aiApiKey,
        model: aiModel || undefined,
        adviceType,
        systemPrompt,
        userPrompt,
      }),
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

    const schedule = (weeklyData.schedule ?? []) as Array<{
      matchupPeriodId: number;
      home: { teamId: number };
      away: { teamId: number };
    }>;

    const matchup = schedule.find(
      (m) =>
        m.matchupPeriodId === currentPeriod &&
        (m.home.teamId === myTeam.id || m.away.teamId === myTeam.id)
    );
    if (!matchup) throw new Error("Could not find your current matchup in the schedule.");

    const opponentId =
      matchup.home.teamId === myTeam.id ? matchup.away.teamId : matchup.home.teamId;
    const opponentTeam = currentLeague.teams.find((t) => t.id === opponentId);
    const opponentName = opponentTeam?.name ?? "Unknown Opponent";

    // Aggregate roster stats
    const myRoster = currentPlayers.filter((p) => myTeam.rosterPlayerIds.includes(p.playerId));
    const opponentRoster = currentPlayers.filter(
      (p) => opponentTeam?.rosterPlayerIds.includes(p.playerId)
    );
    const myStats = aggregateStats(myRoster, currentScoringConfig);
    const opponentStats = aggregateStats(opponentRoster, currentScoringConfig);

    return { myTeam, opponentTeam, opponentName, myStats, opponentStats, currentPeriod };
  }

  // ── Fetch weekly advice ───────────────────────────────────────────────────

  const fetchWeeklyAdvice = useCallback(async (bypassCache = false, signal?: AbortSignal) => {
    if (weeklyBusy.current || !league || !aiApiKey) return;
    weeklyBusy.current = true;
    setWeeklyLoading(true);
    setWeeklyError(null);

    try {
      const period = league.scoringPeriodId;
      if (!bypassCache) {
        const cached = getWeeklyCache(leagueId, sport, period, "weekly");
        if (cached) { setWeeklyAdvice(cached); return; }
      }

      const { myTeam, opponentName, myStats, opponentStats, currentPeriod } =
        await fetchMatchupData(league, scoringConfig, players);

      const systemPrompt = buildSystemPrompt("weekly");
      const userPrompt = buildWeeklyPrompt({
        sportName: sportCfg.name,
        scoringConfig,
        myTeamName: myTeam.name,
        myStats,
        opponentName,
        opponentStats,
      });

      const insights = await callAI("weekly", systemPrompt, userPrompt, signal);
      const advice: CoachAdvice = {
        type: "weekly",
        insights,
        generatedAt: new Date().toISOString(),
        matchupPeriodId: currentPeriod,
        opponentName,
      };
      setCoachCache(`ai_coach_weekly_${leagueId}_${sport}_${currentPeriod}`, advice);
      setWeeklyAdvice(advice);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setWeeklyError((err as Error).message);
    } finally {
      setWeeklyLoading(false);
      weeklyBusy.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league, players, scoringConfig, leagueId, sport, aiApiKey, aiProvider, aiModel, espnS2, swid]);

  // ── Fetch daily advice ────────────────────────────────────────────────────

  const fetchDailyAdvice = useCallback(async (bypassCache = false, signal?: AbortSignal) => {
    if (dailyBusy.current || !league || !aiApiKey) return;
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
        { proGamesByScoringPeriod?: Record<string, unknown[]> }
      >;

      const { myTeam, opponentName, myStats, opponentStats, currentPeriod } =
        await fetchMatchupData(league, scoringConfig, players);

      // Build free agent list
      const ownedIds = new Set(league.teams.flatMap((t) => t.rosterPlayerIds));
      const freeAgents = players.filter((p) => !ownedIds.has(p.playerId));

      // Rank free agents by matchup relevance
      const ranked = rankFreeAgents(freeAgents, myStats, opponentStats, scoringConfig);

      // Attach game counts from proTeamSchedules
      const rankedWithGames = ranked.slice(0, 20).map((p) => {
        const proTeamId = p.teamAbbrev; // stored as string proTeamId
        const gamesThisWeek =
          proTeamSchedules[proTeamId]?.proGamesByScoringPeriod?.[String(currentPeriod)]?.length ?? undefined;
        return { ...p, gamesThisWeek };
      });

      const systemPrompt = buildSystemPrompt("daily");
      const userPrompt = buildDailyPrompt({
        sportName: sportCfg.name,
        scoringConfig,
        myTeamName: myTeam.name,
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

      const today = new Date().toISOString().split("T")[0];
      const advice: CoachAdvice = {
        type: "daily",
        insights,
        generatedAt: new Date().toISOString(),
        opponentName,
        topPlayerIds: topPlayerIds.length > 0 ? topPlayerIds : undefined,
      };
      setCoachCache(`ai_coach_daily_${leagueId}_${sport}_${today}`, advice);
      setDailyAdvice(advice);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setDailyError((err as Error).message);
    } finally {
      setDailyLoading(false);
      dailyBusy.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league, players, scoringConfig, leagueId, sport, aiApiKey, aiProvider, aiModel, espnS2, swid]);

  // ── Fetch trade advice ────────────────────────────────────────────────────

  const fetchTradeAdvice = useCallback(async (bypassCache = false, signal?: AbortSignal) => {
    if (tradeBusy.current || !league || !aiApiKey) return;
    tradeBusy.current = true;
    setTradeLoading(true);
    setTradeError(null);

    try {
      const period = league.scoringPeriodId;
      if (!bypassCache) {
        const cached = getWeeklyCache(leagueId, sport, period, "trade");
        if (cached) { setTradeAdvice(cached); return; }
      }

      // Aggregate stats for every team
      const allTeamStats = league.teams.map((team) => {
        const roster = players.filter((p) => team.rosterPlayerIds.includes(p.playerId));
        const stats = aggregateStats(roster, scoringConfig);
        const rosterNames = roster.slice(0, 8).map((p) => p.playerName);
        return { name: team.name, stats, roster: rosterNames, id: team.id };
      });

      // Find my team
      const myTeamEntry = allTeamStats.find((t) =>
        league.teams.find((lt) => lt.id === t.id && swidMatchesOwner(swid, lt.ownerId))
      );
      if (!myTeamEntry) throw new Error("Could not identify your team.");

      // Compute league average
      const leagueAvg: Record<string, number> = {};
      for (const cat of scoringConfig.cats) {
        const sum = allTeamStats.reduce((acc, t) => acc + (t.stats[cat.id] ?? 0), 0);
        leagueAvg[cat.id] = sum / allTeamStats.length;
      }

      // Compute strong/weak cats
      const myStats = myTeamEntry.stats;
      const strongCats = scoringConfig.cats
        .filter((c) =>
          c.lowerIsBetter
            ? (myStats[c.id] ?? 0) <= (leagueAvg[c.id] ?? 0)
            : (myStats[c.id] ?? 0) >= (leagueAvg[c.id] ?? 0)
        )
        .sort((a, b) => {
          const da = a.lowerIsBetter
            ? (leagueAvg[a.id] ?? 0) - (myStats[a.id] ?? 0)
            : (myStats[a.id] ?? 0) - (leagueAvg[a.id] ?? 0);
          const db = b.lowerIsBetter
            ? (leagueAvg[b.id] ?? 0) - (myStats[b.id] ?? 0)
            : (myStats[b.id] ?? 0) - (leagueAvg[b.id] ?? 0);
          return db - da;
        })
        .slice(0, 3)
        .map((c) => c.id);

      const weakCats = scoringConfig.cats
        .filter((c) =>
          c.lowerIsBetter
            ? (myStats[c.id] ?? 0) > (leagueAvg[c.id] ?? 0)
            : (myStats[c.id] ?? 0) < (leagueAvg[c.id] ?? 0)
        )
        .sort((a, b) => {
          const da = a.lowerIsBetter
            ? (myStats[a.id] ?? 0) - (leagueAvg[a.id] ?? 0)
            : (leagueAvg[a.id] ?? 0) - (myStats[a.id] ?? 0);
          const db = b.lowerIsBetter
            ? (myStats[b.id] ?? 0) - (leagueAvg[b.id] ?? 0)
            : (leagueAvg[b.id] ?? 0) - (myStats[b.id] ?? 0);
          return db - da;
        })
        .slice(0, 3)
        .map((c) => c.id);

      const systemPrompt = buildSystemPrompt("trade");
      const userPrompt = buildTradePrompt({
        sportName: sportCfg.name,
        scoringConfig,
        myTeamName: myTeamEntry.name,
        myStats,
        leagueAvgStats: leagueAvg,
        strongCats,
        weakCats,
        allTeams: allTeamStats.filter((t) => t.name !== myTeamEntry.name),
      });

      const insights = await callAI("trade", systemPrompt, userPrompt, signal);
      const advice: CoachAdvice = {
        type: "trade",
        insights,
        generatedAt: new Date().toISOString(),
        matchupPeriodId: period,
      };
      setCoachCache(`ai_coach_trade_${leagueId}_${sport}_${period}`, advice);
      setTradeAdvice(advice);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setTradeError((err as Error).message);
    } finally {
      setTradeLoading(false);
      tradeBusy.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league, players, scoringConfig, leagueId, sport, aiApiKey, aiProvider, aiModel, swid]);

  // ── Auto-fetch on mount (weekly → daily → trade, strictly sequential) ──────
  // Sequential ensures only one AI request is in-flight at a time,
  // preventing 429 rate-limit errors on free-tier providers (e.g. Gemini 15 RPM).

  useEffect(() => {
    if (!dataReady || weeklyAutoFetched.current) return;
    weeklyAutoFetched.current = true;
    dailyAutoFetched.current = true;
    tradeAutoFetched.current = true;

    const period = league!.scoringPeriodId;

    const controller = new AbortController();
    const { signal } = controller;

    async function runSequential() {
      // Weekly — cache check first to avoid loading flash
      const wCached = getWeeklyCache(leagueId, sport, period, "weekly");
      if (wCached) setWeeklyAdvice(wCached);
      else await fetchWeeklyAdvice(false, signal);

      // Stop here if user navigated away (abort cancels the in-flight request too)
      if (signal.aborted) return;

      // Daily — only starts after weekly fully completes
      const dCached = getDailyCache(leagueId, sport);
      if (dCached) setDailyAdvice(dCached);
      else await fetchDailyAdvice(false, signal);

      if (signal.aborted) return;

      // Trade — only starts after daily fully completes
      const tCached = getWeeklyCache(leagueId, sport, period, "trade");
      if (tCached) setTradeAdvice(tCached);
      else await fetchTradeAdvice(false, signal);
    }

    runSequential();
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataReady, leagueId, sport, league, fetchWeeklyAdvice, fetchDailyAdvice, fetchTradeAdvice]);

  // ── Render ────────────────────────────────────────────────────────────────

  const hasEspnCreds = !!(leagueId && espnS2 && swid);
  const isOffSeason = league?.scoringPeriodId === 0;
  const isLoading = leagueLoading || playersLoading;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
      <div className="mb-2">
        <h1 className="text-xl font-bold text-white">AI Coach</h1>
        {aiApiKey && (
          <p className="text-xs text-gray-600 mt-0.5">
            Powered by {AI_PROVIDER_LABELS[aiProvider]}{" "}
            · {aiModel || AI_DEFAULT_MODELS[aiProvider]}
          </p>
        )}
      </div>

      {/* Inline AI setup */}
      {!aiApiKey && (
        <InlineAISetup
          onSave={(p, k) => { setAiProvider(p); setAiApiKey(k); }}
        />
      )}

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

      {/* Off-season banner for weekly/daily */}
      {isOffSeason && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-300">
          {sportCfg?.name} is in off-season — weekly and daily advice require an active matchup.
          Trade analysis still works.
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
            opponentBadge={weeklyAdvice?.opponentName ? `This week vs ${weeklyAdvice.opponentName}` : undefined}
            advice={isOffSeason ? null : weeklyAdvice}
            loading={weeklyLoading}
            error={isOffSeason ? null : weeklyError}
            onRefresh={() => fetchWeeklyAdvice(true)}
          />

          <CoachCard
            icon="📋"
            title="Daily Pickups"
            description="5 waiver wire recommendations based on free agents who can help you win your current matchup, ranked by game count and category impact."
            updateCadence="Updates once a day"
            opponentBadge={dailyAdvice?.opponentName ? `vs ${dailyAdvice.opponentName}` : undefined}
            advice={isOffSeason ? null : dailyAdvice}
            loading={dailyLoading}
            error={isOffSeason ? null : dailyError}
            onRefresh={() => fetchDailyAdvice(true)}
            showHeadshotRow
            cdnLeague={cdnLeague}
          />

          <CoachCard
            icon="🔁"
            title="Trade Ideas"
            description="3 trade packages tailored to your roster — sends surplus from your strengths to fix your weakest categories vs the rest of the league."
            updateCadence="Updates every matchup period"
            advice={tradeAdvice}
            loading={tradeLoading}
            error={tradeError}
            onRefresh={() => fetchTradeAdvice(true)}
          />
        </>
      )}
    </div>
  );
}
