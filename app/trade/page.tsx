"use client";

import { useState, useEffect, useMemo } from "react";
import { useFantasyLeague } from "@/hooks/useFantasyLeague";
import { useFantasyPlayers } from "@/hooks/useFantasyPlayers";
import { aggregateStats } from "@/lib/stat-calculator";
import { calcTradeScore } from "@/lib/trade-score";
import { scoringConfigLabel } from "@/lib/scoring-config";
import { SPORT_CONFIGS, getStatsWindowNote } from "@/lib/sports-config";
import { StatsWindowTabs } from "@/components/StatsWindowTabs";
import { PlayerSearch } from "@/components/PlayerSearch";
import { PlayerBucket } from "@/components/PlayerBucket";
import { CategoryTable } from "@/components/CategoryTable";
import { VerdictBanner } from "@/components/VerdictBanner";
import { ErrorBanner } from "@/components/ErrorBanner";
import { ShareModal } from "@/components/ShareModal";
import type { StatsWindow, EspnSport, FantasyProvider } from "@/lib/types";
import Link from "next/link";

function windowLabel(w: StatsWindow): string {
  if (w === "season") return "Season";
  if (w === "proj") return "Proj";
  return `L${w}d`;
}

export default function TradePage() {
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

  const [givingIds, setGivingIds] = useState<number[]>([]);
  const [receivingIds, setReceivingIds] = useState<number[]>([]);
  const [shareOpen, setShareOpen] = useState(false);

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

  // Provider-aware league + players hooks
  const { league, scoringConfig } = useFantasyLeague({
    provider,
    espn: { leagueId, espnS2, swid, sport },
    yahoo: { leagueKey: yahooLeagueKey, b: yahooB, t: yahooT },
  });
  const { players, loading, error, reload } = useFantasyPlayers({
    provider,
    espn: { leagueId, espnS2, swid, window: statsWindow, sport, activeSlotIds: league?.activeLineupSlotIds },
    yahoo: { leagueKey: yahooLeagueKey, b: yahooB, t: yahooT, window: statsWindow },
  });

  const playerMap = useMemo(
    () => new Map(players.map((p) => [p.playerId, p])),
    [players]
  );

  const giving = useMemo(
    () => givingIds.map((id) => playerMap.get(id)).filter(Boolean) as typeof players,
    [givingIds, playerMap]
  );
  const receiving = useMemo(
    () => receivingIds.map((id) => playerMap.get(id)).filter(Boolean) as typeof players,
    [receivingIds, playerMap]
  );

  const analysis = useMemo(() => {
    if (givingIds.length === 0 && receivingIds.length === 0) return null;
    if (players.length === 0) return null;
    return calcTradeScore(
      aggregateStats(giving, scoringConfig),
      aggregateStats(receiving, scoringConfig),
      scoringConfig,
    );
  }, [giving, receiving, givingIds, receivingIds, players, scoringConfig]);

  const allBucketedIds = [...givingIds, ...receivingIds];
  const noSettings = provider === "yahoo"
    ? !yahooLeagueKey || (!yahooB && !yahooAccessToken)
    : !leagueId || !espnS2 || !swid;
  const windowNote = getStatsWindowNote(sportConfig, statsWindow);
  // For off-season sports, hide the player UI on any window other than "season"
  // (e.g. WNBA proj loads 2025 projection data but those stats aren't meaningful for 2026)
  const offseasonNoData = !!windowNote && statsWindow !== "season";

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Trade Analyzer</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Results update live — switch windows anytime
          </p>
        </div>
        <StatsWindowTabs
          value={statsWindow}
          onChange={setStatsWindow}
          availableWindows={provider === "yahoo" ? ["season", "30", "14", "7"] : sportConfig.availableWindows}
          size="md"
        />
      </div>

      {noSettings && (
        <div className="mb-6 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 text-sm text-yellow-300">
          Set your {provider === "yahoo" ? "Yahoo league key" : "League ID and ESPN credentials"} in{" "}
          <Link href="/settings" className="underline hover:text-yellow-200">Settings</Link>{" "}
          to load player data.
        </div>
      )}

      {error && <div className="mb-6"><ErrorBanner message={error} onRetry={reload} /></div>}
      {loading && players.length === 0 && <div className="text-center py-12 text-gray-500 text-sm">Loading player pool…</div>}

      {!noSettings && !error && players.length > 0 && !offseasonNoData && (
        <>
          {windowNote && (
            <div className="mb-6 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-sm text-amber-300">
              {windowNote}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-red-400">You Give</p>
              <PlayerSearch
                players={players}
                onAdd={(p) => setGivingIds((ids) => [...ids, p.playerId])}
                exclude={allBucketedIds}
                placeholder="Add a player you're giving…"
                sport={sport}
              />
              <PlayerBucket
                label="Giving"
                players={giving}
                onRemove={(id) => setGivingIds((ids) => ids.filter((i) => i !== id))}
                accentClass="border-red-500/30"
                sport={sport}
              />
            </div>

            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-green-400">You Receive</p>
              <PlayerSearch
                players={players}
                onAdd={(p) => setReceivingIds((ids) => [...ids, p.playerId])}
                exclude={allBucketedIds}
                placeholder="Add a player you're receiving…"
                sport={sport}
              />
              <PlayerBucket
                label="Receiving"
                players={receiving}
                onRemove={(id) => setReceivingIds((ids) => ids.filter((i) => i !== id))}
                accentClass="border-green-500/30"
                sport={sport}
              />
            </div>
          </div>

          {analysis && (
            <div className="flex flex-col gap-4">
              <VerdictBanner
                type="trade"
                wins={analysis.winsForReceiving}
                losses={analysis.losses}
                equals={analysis.equals}
                total={analysis.totalCats}
              />
              {/* Detected scoring config subtitle */}
              <p className="text-center text-xs text-gray-600">
                {sportConfig.name} · {scoringConfigLabel(scoringConfig)}
              </p>
              {scoringConfig.cats.some((c) => c.volumeStatIds) && (
                <p className="text-center text-xs text-gray-700 -mt-2">
                  {scoringConfig.cats.filter((c) => c.volumeStatIds).map((c) => c.id.replace("%", "").trim()).join(", ")} made/attempted shown as on {provider === "yahoo" ? "Yahoo" : "ESPN"} · % uses full accuracy
                </p>
              )}

              {/* Quick stats-window select */}
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <span className="text-xs text-gray-500 shrink-0">Stats window:</span>
                <StatsWindowTabs
                  value={statsWindow}
                  onChange={setStatsWindow}
                  availableWindows={provider === "yahoo" ? ["season", "30", "14", "7"] : sportConfig.availableWindows}
                />
              </div>

              {/* Player summary — so user doesn't need to scroll back up */}
              <div className="bg-[#1a1f2e] border border-white/10 rounded-xl p-4 max-w-lg mx-auto w-full">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-red-400 mb-2">You Give</p>
                    {giving.length === 0 ? (
                      <p className="text-xs text-gray-600">—</p>
                    ) : (
                      giving.map((p) => (
                        <div key={p.playerId} className="py-0.5">
                          <span className="text-sm text-gray-300">{p.playerName}</span>
                          <span className="text-xs text-gray-600 ml-1.5">{p.position}</span>
                        </div>
                      ))
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-green-400 mb-2">You Receive</p>
                    {receiving.length === 0 ? (
                      <p className="text-xs text-gray-600">—</p>
                    ) : (
                      receiving.map((p) => (
                        <div key={p.playerId} className="py-0.5">
                          <span className="text-sm text-gray-300">{p.playerName}</span>
                          <span className="text-xs text-gray-600 ml-1.5">{p.position}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-[#1a1f2e] border border-white/10 rounded-xl overflow-hidden max-w-lg mx-auto w-full">
                <CategoryTable mode="trade" results={analysis.results} />
              </div>
              <div className="flex justify-center">
                <button
                  onClick={() => setShareOpen(true)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-white/8 border border-white/12 text-gray-200 hover:bg-white/12 transition-colors"
                >
                  📤 Share
                </button>
              </div>
              <ShareModal
                open={shareOpen}
                onClose={() => setShareOpen(false)}
                givingPlayers={giving}
                receivingPlayers={receiving}
                analysis={analysis}
                scoringConfig={scoringConfig}
                sportEmoji={sportConfig.emoji}
              />
            </div>
          )}

          {!analysis && (givingIds.length > 0 || receivingIds.length > 0) && (
            <p className="text-center text-gray-600 text-sm">Add at least one player to each side to see results.</p>
          )}
        </>
      )}

      {!loading && !noSettings && !error && (players.length === 0 || offseasonNoData) && (
        windowNote
          ? <div className="mb-6 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-sm text-amber-300">{windowNote}</div>
          : <div className="text-center py-12 text-sm text-gray-500">No players loaded. Check your settings or retry.</div>
      )}
    </div>
  );
}
