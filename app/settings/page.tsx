"use client";

import { useState, useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { clearCache, clearYahooCache } from "@/lib/espn-cache";
import { useLeague } from "@/hooks/useLeague";
import { useYahooLeague } from "@/hooks/useYahooLeague";
import { scoringConfigLabel } from "@/lib/scoring-config";
import { SPORT_CONFIGS } from "@/lib/sports-config";
import { isValidLeagueKey } from "@/lib/yahoo-config";
import type { EspnSport, SavedLeague, FantasyProvider, YahooSavedLeague } from "@/lib/types";

type ConnectedInfo = { label: string; emoji: string; name: string };
type SettingsTab = "espn" | "yahoo";

// ESPN league URL pattern per sport (for hint text in the League ID field)
const SPORT_URL_HINTS: Record<EspnSport, string> = {
  fba:  "fantasy.espn.com/basketball/league?leagueId={ID}",
  wnba: "fantasy.espn.com/basketball/league?leagueId={ID}",
  flb:  "fantasy.espn.com/baseball/league?leagueId={ID}",
  fhl:  "fantasy.espn.com/hockey/league?leagueId={ID}",
  ffl:  "fantasy.espn.com/football/league?leagueId={ID}",
};

// Only sports that are fully supported — others shown as "coming soon"
const ACTIVE_SPORTS: EspnSport[] = ["fba", "wnba", "fhl", "flb"];
const COMING_SOON_SPORTS: EspnSport[] = ["ffl"];

// ── Multi-league helpers (ESPN) ────────────────────────────────────────────────

function loadSavedLeagues(s: EspnSport): SavedLeague[] {
  try {
    const raw = localStorage.getItem(`espn_leagues_${s}`);
    if (raw) return JSON.parse(raw) as SavedLeague[];
  } catch { /* ignore */ }
  const single = localStorage.getItem(`espn_leagueId_${s}`)
    ?? (s === "fba" ? (localStorage.getItem("espn_leagueId") ?? "") : "");
  if (single) {
    const arr: SavedLeague[] = [{ id: single }];
    localStorage.setItem(`espn_leagues_${s}`, JSON.stringify(arr));
    return arr;
  }
  return [];
}

function persistLeagues(s: EspnSport, arr: SavedLeague[]) {
  localStorage.setItem(`espn_leagues_${s}`, JSON.stringify(arr));
}

function appendLeague(s: EspnSport, id: string): SavedLeague[] {
  const arr = loadSavedLeagues(s);
  if (!arr.find(l => l.id === id)) {
    arr.push({ id });
    persistLeagues(s, arr);
  }
  return arr;
}

// ── Multi-league helpers (Yahoo) ───────────────────────────────────────────────

function loadYahooLeagues(): YahooSavedLeague[] {
  try {
    const raw = localStorage.getItem("yahoo_leagues_nba");
    if (raw) return JSON.parse(raw) as YahooSavedLeague[];
  } catch { /* ignore */ }
  const single = localStorage.getItem("yahoo_league_key_nba") ?? "";
  if (single) {
    const arr: YahooSavedLeague[] = [{ key: single }];
    localStorage.setItem("yahoo_leagues_nba", JSON.stringify(arr));
    return arr;
  }
  return [];
}

function persistYahooLeagues(arr: YahooSavedLeague[]) {
  localStorage.setItem("yahoo_leagues_nba", JSON.stringify(arr));
}

function appendYahooLeague(key: string): YahooSavedLeague[] {
  const arr = loadYahooLeagues();
  if (!arr.find(l => l.key === key)) {
    arr.push({ key });
    persistYahooLeagues(arr);
  }
  return arr;
}

// ──────────────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  // Provider tab state (ESPN vs Yahoo in Manual Setup)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("espn");

  // ── ESPN state ────────────────────────────────────────────────────────────
  const [sport, setSport] = useState<EspnSport>("fba");
  const [leagueId, setLeagueId] = useState("");
  const [espnS2, setEspnS2] = useState("");
  const [swid, setSwid] = useState("");
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [clickedBookmark, setClickedBookmark] = useState(false);
  const [autoResult, setAutoResult] = useState<{ s2: boolean; swid: boolean; leagueId: boolean } | null>(null);
  const [savedConnectedInfo, setSavedConnectedInfo] = useState<ConnectedInfo | null>(null);
  const [comingSoonAlert, setComingSoonAlert] = useState<string | null>(null);
  const [savedLeagues, setSavedLeagues] = useState<SavedLeague[]>([]);
  const [editingLeagueId, setEditingLeagueId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // ── Yahoo state ───────────────────────────────────────────────────────────
  const [yahooAccessToken, setYahooAccessToken] = useState("");
  const [yahooLeagueUrl, setYahooLeagueUrl] = useState("");
  const [yahooLeagueKey, setYahooLeagueKey] = useState("");
  const [yahooB, setYahooB] = useState("");
  const [yahooT, setYahooT] = useState("");
  const [yahooSaved, setYahooSaved] = useState(false);
  const [yahooClickedBookmark, setYahooClickedBookmark] = useState(false);
  const [yahooAutoResult, setYahooAutoResult] = useState<{ b: boolean; leagueKey: boolean } | null>(null);
  const [yahooOAuthError, setYahooOAuthError] = useState<string | null>(null);
  const [yahooSavedConnectedInfo, setYahooSavedConnectedInfo] = useState<ConnectedInfo | null>(null);
  const [yahooLeagues, setYahooLeagues] = useState<YahooSavedLeague[]>([]);
  const [yahooEditingKey, setYahooEditingKey] = useState<string | null>(null);
  const [yahooEditingLabel, setYahooEditingLabel] = useState("");
  const [yahooDropdownOpen, setYahooDropdownOpen] = useState(false);

  const bookmarkRef = useRef<HTMLAnchorElement>(null);
  const yahooBookmarkRef = useRef<HTMLAnchorElement>(null);
  const leagueDropdownRef = useRef<HTMLDivElement>(null);
  const yahooDropdownRef = useRef<HTMLDivElement>(null);

  // ── URL param handling ─────────────────────────────────────────────────────

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    // Yahoo OAuth callback OR legacy cookie: ?yahoo_auto=1&...
    if (params.get("yahoo_auto") === "1") {
      const paramAccessToken  = params.get("yahoo_access_token") ?? "";
      const paramRefreshToken = params.get("yahoo_refresh_token") ?? "";
      const paramExpires      = params.get("yahoo_token_expires") ?? "";
      const paramLeagueKey    = params.get("league_key") ?? "";
      const paramAllKeys      = params.get("all_league_keys") ?? "";
      // Legacy cookie params (kept as fallback)
      const paramB = params.get("b") ?? "";
      const paramT = params.get("t") ?? "";

      setSettingsTab("yahoo");

      if (paramAccessToken) {
        // ── OAuth path ──────────────────────────────────────────────────────
        setYahooAccessToken(paramAccessToken);
        localStorage.setItem("yahoo_access_token", paramAccessToken);
        if (paramRefreshToken) localStorage.setItem("yahoo_refresh_token", paramRefreshToken);
        if (paramExpires)      localStorage.setItem("yahoo_token_expires", paramExpires);

        const key = paramLeagueKey || localStorage.getItem("yahoo_league_key_nba") || "";
        if (key) {
          setYahooLeagueKey(key);
          localStorage.setItem("yahoo_league_key_nba", key);
          appendYahooLeague(key);
        }
        // Register any additional leagues found
        if (paramAllKeys) {
          for (const k of paramAllKeys.split(",").filter(Boolean)) appendYahooLeague(k);
        }

        setYahooSaved(true);
        localStorage.setItem("fantasy_provider", "yahoo");
        window.dispatchEvent(new Event("fantasy-settings-changed"));
      } else if (paramB) {
        // ── Legacy cookie path ──────────────────────────────────────────────
        setYahooB(paramB);
        setYahooT(paramT);
        setYahooLeagueKey(paramLeagueKey || localStorage.getItem("yahoo_league_key_nba") || "");
        setYahooAutoResult({ b: !!paramB, leagueKey: !!paramLeagueKey });

        if (paramLeagueKey) {
          localStorage.setItem("yahoo_b", paramB);
          if (paramT) localStorage.setItem("yahoo_t", paramT);
          localStorage.setItem("yahoo_league_key_nba", paramLeagueKey);
          appendYahooLeague(paramLeagueKey);
          setYahooSaved(true);
          localStorage.setItem("fantasy_provider", "yahoo");
          window.dispatchEvent(new Event("fantasy-settings-changed"));
        }
      }

      setYahooLeagues(loadYahooLeagues());
      window.history.replaceState({}, "", "/settings");
      return;
    }

    // Yahoo OAuth error: ?yahoo_error=...
    if (params.get("yahoo_error")) {
      const errCode = params.get("yahoo_error") ?? "unknown";
      const errMessages: Record<string, string> = {
        no_code:               "Yahoo sign-in was cancelled or failed. Please try again.",
        not_configured:        "Yahoo OAuth is not configured. Add YAHOO_CLIENT_ID and YAHOO_CLIENT_SECRET to .env.local.",
        token_exchange_failed: "Yahoo returned an error when exchanging the auth code. Check your client credentials.",
        callback_error:        "An unexpected error occurred during Yahoo sign-in.",
      };
      setYahooOAuthError(errMessages[errCode] ?? `Yahoo sign-in failed (${errCode}).`);
      setSettingsTab("yahoo");
      window.history.replaceState({}, "", "/settings");
    }

    // ESPN Quick Connect: ?auto=1&s2=...&swid=...&leagueId=...&sport=...
    if (params.get("auto") === "1") {
      const paramS2    = params.get("s2") ?? "";
      const paramSwid  = params.get("swid") ?? "";
      const paramLid   = params.get("leagueId") ?? "";
      const paramSport = (params.get("sport") as EspnSport | null) ?? null;

      if (paramSport && COMING_SOON_SPORTS.includes(paramSport as EspnSport)) {
        const sportName = SPORT_CONFIGS[paramSport as EspnSport]?.name ?? paramSport;
        setComingSoonAlert(sportName);
        window.history.replaceState({}, "", "/settings");
        const storedSport = (localStorage.getItem("espn_sport") as EspnSport | null) ?? "fba";
        const validSport  = storedSport in SPORT_CONFIGS ? storedSport : "fba";
        setSport(validSport);
        const leagueIdFallback = validSport === "fba" ? (localStorage.getItem("espn_leagueId") ?? "") : "";
        setLeagueId(localStorage.getItem(`espn_leagueId_${validSport}`) ?? leagueIdFallback);
        setEspnS2(localStorage.getItem("espn_s2") ?? "");
        setSwid(localStorage.getItem("espn_swid") ?? "");
        setSavedLeagues(loadSavedLeagues(validSport));
        return;
      }

      const activeSport = (paramSport && paramSport in SPORT_CONFIGS)
        ? paramSport
        : ((localStorage.getItem("espn_sport") as EspnSport | null) ?? "fba");

      const s2      = paramS2    || localStorage.getItem("espn_s2")    || "";
      const swidVal = paramSwid  || localStorage.getItem("espn_swid")  || "";
      const lid     = paramLid   || localStorage.getItem(`espn_leagueId_${activeSport}`) || localStorage.getItem("espn_leagueId") || "";

      setSport(activeSport);
      setEspnS2(s2);
      setSwid(swidVal);
      setLeagueId(lid);
      setAutoResult({ s2: !!paramS2, swid: !!paramSwid, leagueId: !!paramLid });

      if (s2 && swidVal && lid) {
        localStorage.setItem("espn_sport", activeSport);
        localStorage.setItem(`espn_leagueId_${activeSport}`, lid);
        localStorage.setItem("espn_s2", s2);
        localStorage.setItem("espn_swid", swidVal);
        appendLeague(activeSport, lid);
        clearCache(lid);
        setSaved(true);
      }

      for (const s of Object.keys(SPORT_CONFIGS) as EspnSport[]) {
        const extraLid = params.get(`lid_${s}`);
        if (extraLid && s !== activeSport) {
          localStorage.setItem(`espn_leagueId_${s}`, extraLid);
          appendLeague(s, extraLid);
        }
      }

      for (const s of Object.keys(SPORT_CONFIGS) as EspnSport[]) {
        const raw = params.get(`lids_${s}`);
        if (!raw) continue;
        const incoming = raw.split(",").filter(Boolean);
        if (incoming.length === 0) continue;
        if (!localStorage.getItem(`espn_leagueId_${s}`)) {
          localStorage.setItem(`espn_leagueId_${s}`, incoming[0]);
        }
        for (const id of incoming) appendLeague(s, id);
      }

      for (const s of Object.keys(SPORT_CONFIGS) as EspnSport[]) {
        const rawMeta = params.get(`lmeta_${s}`);
        if (!rawMeta) continue;
        try {
          const meta = JSON.parse(rawMeta) as Array<{ id: string; label?: string }>;
          if (meta.length === 0) continue;
          if (!localStorage.getItem(`espn_leagueId_${s}`)) {
            localStorage.setItem(`espn_leagueId_${s}`, meta[0].id);
          }
          const arr = loadSavedLeagues(s);
          let changed = false;
          for (const m of meta) {
            const existing = arr.find(l => l.id === m.id);
            if (!existing) {
              arr.push({ id: m.id, ...(m.label ? { label: m.label } : {}) });
              changed = true;
            } else if (m.label && existing.label !== m.label) {
              existing.label = m.label;
              changed = true;
            }
          }
          if (changed) persistLeagues(s, arr);
        } catch { /* ignore */ }
      }

      // Yahoo credentials from QR transfer
      const qrYahooAccessToken = params.get("yahoo_access_token") ?? "";
      const qrYahooB = params.get("yahoo_b") ?? "";
      const qrYahooT = params.get("yahoo_t") ?? "";
      const qrYahooKey = params.get("yahoo_league_key_nba") ?? "";
      if (qrYahooAccessToken) {
        localStorage.setItem("yahoo_access_token", qrYahooAccessToken);
        setYahooAccessToken(qrYahooAccessToken);
      }
      if (qrYahooB) {
        localStorage.setItem("yahoo_b", qrYahooB);
        if (qrYahooT) localStorage.setItem("yahoo_t", qrYahooT);
      }
      if (qrYahooKey) {
        localStorage.setItem("yahoo_league_key_nba", qrYahooKey);
        appendYahooLeague(qrYahooKey);
      }

      setSavedLeagues(loadSavedLeagues(activeSport));
      window.history.replaceState({}, "", "/settings");
    } else {
      // Normal load — restore from localStorage
      const storedSport = (localStorage.getItem("espn_sport") as EspnSport | null) ?? "fba";
      const validSport  = storedSport in SPORT_CONFIGS ? storedSport : "fba";
      setSport(validSport);
      const leagueIdFallback = validSport === "fba" ? (localStorage.getItem("espn_leagueId") ?? "") : "";
      setLeagueId(localStorage.getItem(`espn_leagueId_${validSport}`) ?? leagueIdFallback);
      setEspnS2(localStorage.getItem("espn_s2") ?? "");
      setSwid(localStorage.getItem("espn_swid") ?? "");
      setSavedLeagues(loadSavedLeagues(validSport));
    }

    // Always restore Yahoo state
    setYahooAccessToken(localStorage.getItem("yahoo_access_token") ?? "");
    setYahooLeagueKey(localStorage.getItem("yahoo_league_key_nba") ?? "");
    setYahooB(localStorage.getItem("yahoo_b") ?? "");
    setYahooT(localStorage.getItem("yahoo_t") ?? "");
    setYahooLeagues(loadYahooLeagues());

    // Sync settings tab to active provider
    const provider = (localStorage.getItem("fantasy_provider") as FantasyProvider | null) ?? "espn";
    setSettingsTab(provider === "yahoo" ? "yahoo" : "espn");
  }, []);

  // Sync settings tab when provider changes from navbar
  useEffect(() => {
    function syncTab() {
      const p = (localStorage.getItem("fantasy_provider") as FantasyProvider | null) ?? "espn";
      setSettingsTab(p === "yahoo" ? "yahoo" : "espn");
    }
    window.addEventListener("fantasy-settings-changed", syncTab);
    return () => window.removeEventListener("fantasy-settings-changed", syncTab);
  }, []);

  // Persist sport immediately when it changes
  function handleSportChange(newSport: EspnSport) {
    setSport(newSport);
    const savedLid = localStorage.getItem(`espn_leagueId_${newSport}`) ?? "";
    setLeagueId(savedLid);
    setSaved(false);
    setSavedLeagues(loadSavedLeagues(newSport));
    setEditingLeagueId(null);
    setDropdownOpen(false);
    localStorage.setItem("espn_sport", newSport);
    window.dispatchEvent(new Event("fantasy-settings-changed"));
  }

  // ESPN bookmarklet
  useEffect(() => {
    if (!bookmarkRef.current) return;
    const origin = window.location.origin;
    const code = `javascript:(function(){` +
      `var c={};` +
      `document.cookie.split(';').forEach(function(x){` +
        `var i=x.trim().indexOf('=');` +
        `if(i>0)c[x.trim().slice(0,i)]=decodeURIComponent(x.trim().slice(i+1));` +
      `});` +
      `var s2=c['espn_s2']||'';` +
      `var sw=c['SWID']||'';` +
      `var href=location.href;` +
      `var m=href.match(/[?&#]leagueId=(\\d+)/)||href.match(/\\/league\\/(\\d+)/);` +
      `var lid=m?m[1]:'';` +
      `var sp='fba';` +
      `if(href.indexOf('/womens-basketball/')>-1)sp='wnba';` +
      `else if(href.indexOf('/football/')>-1)sp='ffl';` +
      `else if(href.indexOf('/baseball/')>-1)sp='flb';` +
      `else if(href.indexOf('/hockey/')>-1)sp='fhl';` +
      `location.href='${origin}/settings?auto=1&leagueId='+encodeURIComponent(lid)+'&s2='+encodeURIComponent(s2)+'&swid='+encodeURIComponent(sw)+'&sport='+sp;` +
    `})();`;
    bookmarkRef.current.href = code;
  }, []);

  // Yahoo bookmarklet
  useEffect(() => {
    if (!yahooBookmarkRef.current) return;
    const origin = window.location.origin;
    // Extracts B cookie, T cookie, and league key from Yahoo Fantasy Basketball page
    // URL format: basketball.fantasysports.yahoo.com/nba/{league_id}/...
    const code = `javascript:(function(){` +
      `var c={};` +
      `document.cookie.split(';').forEach(function(x){` +
        `var i=x.trim().indexOf('=');` +
        `if(i>0)c[x.trim().slice(0,i)]=decodeURIComponent(x.trim().slice(i+1));` +
      `});` +
      `var b=c['B']||'';` +
      `var t=c['T']||'';` +
      `var href=location.href;` +
      // Extract league_id from URL path: /nba/{league_id}/...
      `var m=href.match(/\\/nba\\/(\\d+)/);` +
      `var lid=m?m[1]:'';` +
      // Game key: try to get from page data, default to "428" (NBA 2024-25)
      `var gk='428';` +
      `try{` +
        `var rd=window.__reactReduxData__||window.__PRELOADED_STATE__;` +
        `if(rd){` +
          `var j=JSON.stringify(rd);` +
          `var gm=j.match(/"game_key":"(\\d+)"/);` +
          `if(gm)gk=gm[1];` +
        `}` +
      `}catch(e){}` +
      `var lk=lid?(gk+'.l.'+lid):'';` +
      `location.href='${origin}/settings?yahoo_auto=1&b='+encodeURIComponent(b)+'&t='+encodeURIComponent(t)+'&league_key='+encodeURIComponent(lk);` +
    `})();`;
    yahooBookmarkRef.current.href = code;
  }, []);

  // Close ESPN dropdown when clicking outside
  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (leagueDropdownRef.current && !leagueDropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  // Close Yahoo dropdown when clicking outside
  useEffect(() => {
    if (!yahooDropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (yahooDropdownRef.current && !yahooDropdownRef.current.contains(e.target as Node)) {
        setYahooDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [yahooDropdownOpen]);

  // ── ESPN league hook ───────────────────────────────────────────────────────
  const { league, scoringConfig } = useLeague(leagueId, espnS2, swid, sport);
  const sportCfg = SPORT_CONFIGS[sport];

  // ── Yahoo league hook ──────────────────────────────────────────────────────
  const { league: yahooLeague, scoringConfig: yahooScoringConfig, reload: reloadYahooLeague } = useYahooLeague(
    yahooLeagueKey, yahooB, yahooT
  );

  // Load persisted ESPN connected info
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`espn_last_connected_${sport}`);
      setSavedConnectedInfo(raw ? (JSON.parse(raw) as ConnectedInfo) : null);
    } catch { setSavedConnectedInfo(null); }
  }, [sport]);

  // Save ESPN connected info when league loads
  useEffect(() => {
    if (!league) return;
    const info: ConnectedInfo = {
      label: scoringConfigLabel(scoringConfig),
      emoji: sportCfg.emoji,
      name:  sportCfg.name,
    };
    setSavedConnectedInfo(info);
    localStorage.setItem(`espn_last_connected_${sport}`, JSON.stringify(info));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league?.leagueId, scoringConfig]);

  // Load persisted Yahoo connected info
  useEffect(() => {
    try {
      const raw = localStorage.getItem("yahoo_last_connected_nba");
      setYahooSavedConnectedInfo(raw ? (JSON.parse(raw) as ConnectedInfo) : null);
    } catch { setYahooSavedConnectedInfo(null); }
  }, []);

  // Save Yahoo connected info when league loads
  useEffect(() => {
    if (!yahooLeague) return;
    const info: ConnectedInfo = {
      label: scoringConfigLabel(yahooScoringConfig),
      emoji: "🏀",
      name:  "Yahoo NBA",
    };
    setYahooSavedConnectedInfo(info);
    localStorage.setItem("yahoo_last_connected_nba", JSON.stringify(info));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yahooLeague?.leagueId, yahooScoringConfig]);

  // ESPN auto-save when league loads
  useEffect(() => {
    if (!league) return;
    const lid = leagueId.trim();
    const s2  = espnS2.trim();
    const sw  = swid.trim();
    if (!lid || !s2 || !sw) return;
    localStorage.setItem("espn_sport", sport);
    localStorage.setItem(`espn_leagueId_${sport}`, lid);
    localStorage.setItem("espn_s2", s2);
    localStorage.setItem("espn_swid", sw);
    setSavedLeagues(prev => {
      if (prev.find(l => l.id === lid)) return prev;
      const updated = [...prev, { id: lid }];
      persistLeagues(sport, updated);
      return updated;
    });
    window.dispatchEvent(new Event("fantasy-settings-changed"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league?.leagueId]);

  // Yahoo auto-save when league loads
  useEffect(() => {
    if (!yahooLeague || !yahooLeagueKey || (!yahooB && !yahooAccessToken)) return;
    localStorage.setItem("yahoo_league_key_nba", yahooLeagueKey);
    if (yahooB) localStorage.setItem("yahoo_b", yahooB);
    if (yahooT) localStorage.setItem("yahoo_t", yahooT);
    const leagueName = yahooLeague.name ?? "";
    setYahooLeagues(prev => {
      const idx = prev.findIndex(l => l.key === yahooLeagueKey);
      if (idx >= 0) {
        // Already exists — update teamName if now available and not yet set
        if (!leagueName || prev[idx].teamName) return prev;
        const updated = [...prev];
        updated[idx] = { ...updated[idx], teamName: leagueName };
        persistYahooLeagues(updated);
        return updated;
      }
      // New league — add it with name if available
      const entry: YahooSavedLeague = { key: yahooLeagueKey };
      if (leagueName) entry.teamName = leagueName;
      const updated = [...prev, entry];
      persistYahooLeagues(updated);
      return updated;
    });
    window.dispatchEvent(new Event("fantasy-settings-changed"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yahooLeague?.leagueId]);

  // ESPN auto-detect team name via SWID
  useEffect(() => {
    if (!league || !swid || !leagueId) return;
    const swidNorm = swid.toLowerCase();
    const myTeam = league.teams.find(t => t.ownerId === swidNorm);
    if (!myTeam) return;
    setSavedLeagues(prev => {
      const idx = prev.findIndex(l => l.id === leagueId);
      if (idx < 0) return prev;
      if (prev[idx].teamName === myTeam.name) return prev;
      const updated = [...prev];
      updated[idx] = { ...updated[idx], teamName: myTeam.name, teamId: myTeam.id };
      persistLeagues(sport, updated);
      return updated;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league?.leagueId, swid]);

  function handleSave() {
    const lid = leagueId.trim();
    const s2  = espnS2.trim();
    const sw  = swid.trim();
    localStorage.setItem("espn_sport", sport);
    localStorage.setItem(`espn_leagueId_${sport}`, lid);
    localStorage.setItem("espn_s2", s2);
    localStorage.setItem("espn_swid", sw);
    setSavedLeagues(prev => {
      if (prev.find(l => l.id === lid)) return prev;
      const updated = [...prev, { id: lid }];
      persistLeagues(sport, updated);
      return updated;
    });
    clearCache(lid);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  function handleYahooSave() {
    const key = yahooLeagueKey.trim();
    const b   = yahooB.trim();
    const t   = yahooT.trim();
    if (!key || (!b && !yahooAccessToken)) return;
    localStorage.setItem("yahoo_league_key_nba", key);
    if (b) localStorage.setItem("yahoo_b", b);
    if (t) localStorage.setItem("yahoo_t", t);
    setYahooLeagues(prev => {
      if (prev.find(l => l.key === key)) return prev;
      const updated = [...prev, { key }];
      persistYahooLeagues(updated);
      return updated;
    });
    clearYahooCache(key);
    setYahooSaved(true);
    setTimeout(() => setYahooSaved(false), 2500);
    window.dispatchEvent(new Event("fantasy-settings-changed"));
  }

  function disconnectYahoo() {
    localStorage.removeItem("yahoo_access_token");
    localStorage.removeItem("yahoo_refresh_token");
    localStorage.removeItem("yahoo_token_expires");
    localStorage.removeItem("yahoo_b");
    localStorage.removeItem("yahoo_t");
    localStorage.removeItem("yahoo_league_key_nba");
    localStorage.removeItem("yahoo_leagues_nba");
    localStorage.removeItem("yahoo_last_connected_nba");
    setYahooAccessToken("");
    setYahooB("");
    setYahooT("");
    setYahooLeagueKey("");
    setYahooLeagues([]);
    setYahooSavedConnectedInfo(null);
    window.dispatchEvent(new Event("fantasy-settings-changed"));
  }

  function activateLeague(id: string) {
    setLeagueId(id);
    localStorage.setItem(`espn_leagueId_${sport}`, id);
    window.dispatchEvent(new Event("fantasy-settings-changed"));
  }

  function removeLeague(id: string) {
    setSavedLeagues(prev => {
      const arr = prev.filter(l => l.id !== id);
      persistLeagues(sport, arr);
      if (id === leagueId) {
        if (arr.length > 0) {
          setLeagueId(arr[0].id);
          localStorage.setItem(`espn_leagueId_${sport}`, arr[0].id);
        } else {
          setLeagueId("");
          localStorage.removeItem(`espn_leagueId_${sport}`);
        }
        window.dispatchEvent(new Event("fantasy-settings-changed"));
      }
      return arr;
    });
  }

  function saveLeagueLabel(id: string) {
    setSavedLeagues(prev => {
      const updated = prev.map(l => {
        if (l.id !== id) return l;
        const trimmed = editingLabel.trim();
        if (!trimmed) return { id: l.id, teamName: l.teamName, teamId: l.teamId };
        return { ...l, label: trimmed };
      });
      persistLeagues(sport, updated);
      return updated;
    });
    setEditingLeagueId(null);
  }

  function activateYahooLeague(key: string) {
    clearYahooCache(key);
    setYahooLeagueKey(key);
    localStorage.setItem("yahoo_league_key_nba", key);
    window.dispatchEvent(new Event("fantasy-settings-changed"));
  }

  function removeYahooLeague(key: string) {
    setYahooLeagues(prev => {
      const arr = prev.filter(l => l.key !== key);
      persistYahooLeagues(arr);
      if (key === yahooLeagueKey) {
        if (arr.length > 0) {
          setYahooLeagueKey(arr[0].key);
          localStorage.setItem("yahoo_league_key_nba", arr[0].key);
        } else {
          setYahooLeagueKey("");
          localStorage.removeItem("yahoo_league_key_nba");
        }
        window.dispatchEvent(new Event("fantasy-settings-changed"));
      }
      return arr;
    });
  }

  function saveYahooLeagueLabel(key: string) {
    setYahooLeagues(prev => {
      const updated = prev.map(l => {
        if (l.key !== key) return l;
        const trimmed = yahooEditingLabel.trim();
        if (!trimmed) return { key: l.key, teamName: l.teamName };
        return { ...l, label: trimmed };
      });
      persistYahooLeagues(updated);
      return updated;
    });
    setYahooEditingKey(null);
  }

  // Build transfer URL — includes both ESPN and Yahoo credentials
  function buildTransferUrl() {
    let url = `${window.location.origin}/settings?auto=1`
      + `&leagueId=${encodeURIComponent(leagueId)}`
      + `&s2=${encodeURIComponent(espnS2)}`
      + `&swid=${encodeURIComponent(swid)}`
      + `&sport=${encodeURIComponent(sport)}`;

    for (const s of Object.keys(SPORT_CONFIGS) as EspnSport[]) {
      const arr = s === sport ? savedLeagues : loadSavedLeagues(s);
      if (arr.length === 0) continue;
      const meta = arr.map(l => ({ id: l.id, ...(l.label ? { label: l.label } : {}) }));
      url += `&lmeta_${s}=${encodeURIComponent(JSON.stringify(meta))}`;
    }

    // Include Yahoo credentials if connected (OAuth token takes priority over B cookie)
    if (yahooAccessToken) url += `&yahoo_access_token=${encodeURIComponent(yahooAccessToken)}`;
    if (yahooB) url += `&yahoo_b=${encodeURIComponent(yahooB)}`;
    if (yahooT) url += `&yahoo_t=${encodeURIComponent(yahooT)}`;
    if (yahooLeagueKey) url += `&yahoo_league_key_nba=${encodeURIComponent(yahooLeagueKey)}`;

    return url;
  }

  const allAutoDetected = autoResult?.s2 && autoResult?.swid && autoResult?.leagueId;
  const partialAutoDetected = autoResult && !allAutoDetected;
  const yahooConnected = !!(yahooLeague || (yahooSavedConnectedInfo && yahooLeagueKey && (yahooB || yahooAccessToken)));
  const offSeason = league && league.scoringPeriodId === 0;

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-white mb-2">Settings</h1>
      <p className="text-gray-500 text-sm mb-8">
        Connect your fantasy league. Credentials are stored only in your browser.
      </p>

      {/* Coming-soon sport alert */}
      {comingSoonAlert && (
        <div className="mb-6 bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-amber-300">{comingSoonAlert} is not available yet</p>
            <p className="text-xs text-amber-400/70 mt-1">We&apos;re working on it — check back soon!</p>
          </div>
          <button onClick={() => setComingSoonAlert(null)} className="text-amber-500/60 hover:text-amber-300 text-xl leading-none shrink-0 transition-colors">×</button>
        </div>
      )}

      {/* Yahoo auto-detect result banner */}
      {yahooAutoResult && settingsTab === "yahoo" && (
        yahooAutoResult.b && yahooAutoResult.leagueKey ? (
          <div className="mb-6 bg-green-500/10 border border-green-500/20 rounded-lg p-4 text-sm text-green-300">
            Yahoo credentials detected and saved. You&apos;re ready to go!
          </div>
        ) : (
          <div className="mb-6 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 text-sm text-yellow-300 space-y-1">
            <p className="font-semibold">Partially detected — fill in the missing fields below.</p>
            {!yahooAutoResult.b && <p className="text-yellow-200/80"><strong>B cookie</strong> not found — make sure you are on a Yahoo Fantasy Basketball page.</p>}
            {!yahooAutoResult.leagueKey && <p className="text-yellow-200/80"><strong>League key</strong> not found — navigate to your specific Yahoo league page first.</p>}
          </div>
        )
      )}

      {/* ESPN connected banner */}
      {settingsTab === "espn" && (league || (savedConnectedInfo && leagueId && espnS2 && swid)) && (() => {
        const info: ConnectedInfo = league
          ? { label: scoringConfigLabel(scoringConfig), emoji: sportCfg.emoji, name: sportCfg.name }
          : savedConnectedInfo!;
        return (
          <div className="mb-3 bg-green-500/10 border border-green-500/25 rounded-lg p-4 text-sm space-y-1">
            <p className="font-semibold text-white flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-green-500/20 text-green-400 text-xs font-bold shrink-0">✓</span>
              {info.emoji} ESPN {info.name} connected
            </p>
            <p className="font-mono text-gray-400 pl-7">{info.label}</p>
            <p className="text-gray-600 pl-7 text-xs pt-1">Changed your ESPN league settings? Click Save Settings to force-refresh.</p>
          </div>
        );
      })()}

      {/* Yahoo connected banner */}
      {settingsTab === "yahoo" && yahooConnected && (() => {
        const info: ConnectedInfo = yahooLeague
          ? { label: scoringConfigLabel(yahooScoringConfig), emoji: "🏀", name: "Yahoo NBA" }
          : yahooSavedConnectedInfo!;
        return (
          <div className="mb-3 bg-green-500/10 border border-green-500/25 rounded-lg p-4 text-sm space-y-1">
            <p className="font-semibold text-white flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-green-500/20 text-green-400 text-xs font-bold shrink-0">✓</span>
              {info.emoji} Yahoo NBA connected
            </p>
            <p className="font-mono text-gray-400 pl-7">{info.label}</p>
            <div className="flex items-center justify-between pl-7 pt-1">
              <p className="text-gray-600 text-xs">Auth errors? Click &quot;Reconnect Yahoo&quot; to sign in again.</p>
              <div className="flex items-center gap-3 ml-2 shrink-0">
                <button
                  onClick={() => reloadYahooLeague()}
                  title="Re-fetch league settings from Yahoo (use after changing your league's scoring settings)"
                  className="text-xs text-blue-400/70 hover:text-blue-300 transition-colors"
                >
                  ↻ Sync Settings
                </button>
                <button onClick={disconnectYahoo} className="text-xs text-red-400/70 hover:text-red-400 transition-colors">Disconnect</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Off-season banner */}
      {offSeason && settingsTab === "espn" && (
        <div className="mb-6 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 text-sm text-yellow-300">
          {sportCfg.name} is in off-season — stat windows will show the most recent completed season data.
        </div>
      )}

      {/* ESPN auto-detect result banners */}
      {settingsTab === "espn" && allAutoDetected && (
        <div className="mb-6 bg-green-500/10 border border-green-500/20 rounded-lg p-4 text-sm text-green-300">
          All credentials detected and saved automatically. You&apos;re ready to go!
        </div>
      )}
      {settingsTab === "espn" && partialAutoDetected && (
        <div className="mb-6 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 text-sm text-yellow-300 space-y-1">
          <p className="font-semibold">Partially detected — fill in the missing fields below.</p>
          {!autoResult.s2 && (
            <p className="text-yellow-200/80">
              <strong>espn_s2</strong> could not be read automatically (ESPN marks it as HttpOnly).
              Copy it manually from DevTools → see instructions below.
            </p>
          )}
          {!autoResult.leagueId && (
            <p className="text-yellow-200/80">
              <strong>League ID</strong> not found — make sure you were on your ESPN Fantasy league page when you clicked the bookmark.
            </p>
          )}
        </div>
      )}

      {/* ── Manual Setup ──────────────────────────────────── */}
      <div className="bg-[#1a1f2e] border border-white/10 rounded-xl p-6 mb-4">
        <h2 className="text-base font-semibold text-white mb-4">Manual Setup</h2>

        {/* Provider tabs */}
        <div className="flex gap-1 mb-5 p-1 bg-black/20 rounded-lg w-fit">
          {(["espn", "yahoo"] as SettingsTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => {
                setSettingsTab(tab);
                const p: FantasyProvider = tab === "yahoo" ? "yahoo" : "espn";
                localStorage.setItem("fantasy_provider", p);
                window.dispatchEvent(new Event("fantasy-settings-changed"));
              }}
              className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                settingsTab === tab
                  ? "bg-[#e8193c] text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {tab === "espn" ? "ESPN" : "Yahoo"}
            </button>
          ))}
        </div>

        {/* ── ESPN Tab ─────────────────────────────────────── */}
        {settingsTab === "espn" && (
          <div className="flex flex-col gap-5">
            <p className="text-xs text-gray-500 -mt-3">Paste your ESPN credentials directly, or use Quick Connect below.</p>

            {/* Sport selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-white">Sport</label>
              <p className="text-xs text-gray-500">Select your ESPN fantasy sport. Each sport has its own League ID.</p>
              <div className="flex flex-wrap gap-2 mt-1">
                {ACTIVE_SPORTS.map((s) => {
                  const c = SPORT_CONFIGS[s];
                  return (
                    <button
                      key={s}
                      onClick={() => handleSportChange(s)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                        sport === s
                          ? "bg-[#e8193c] border-[#e8193c] text-white"
                          : "border-white/10 text-gray-400 hover:text-white hover:border-white/20"
                      }`}
                    >
                      <span>{c.emoji}</span>
                      <span>{c.name}</span>
                    </button>
                  );
                })}
                {COMING_SOON_SPORTS.map((s) => {
                  const c = SPORT_CONFIGS[s];
                  return (
                    <button key={s} disabled className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-white/5 text-gray-500 cursor-not-allowed">
                      <span className="absolute -top-2 -right-1 text-[9px] bg-[#1a1f2e] border border-amber-500/40 px-1 py-px rounded-full font-semibold text-amber-400/90 leading-none">Soon</span>
                      <span>{c.emoji}</span>
                      <span>{c.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ESPN League dropdown */}
            {savedLeagues.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-white">Your {sportCfg.name} Leagues</label>
                <p className="text-xs text-gray-500">
                  You can load more than one {sportCfg.name} league. Quick Connect adds leagues automatically.
                </p>
                <div className="relative" ref={leagueDropdownRef}>
                  <button
                    onClick={() => setDropdownOpen(o => !o)}
                    className="flex items-center justify-between w-full px-3 py-2 rounded-lg text-sm border border-white/10 bg-[#0f1117] text-white hover:border-white/20 transition-colors"
                  >
                    <span className="truncate">
                      {(() => {
                        const active = savedLeagues.find(l => l.id === leagueId);
                        return active ? (active.label ?? active.teamName ?? `#${active.id}`) : "Select a league…";
                      })()}
                    </span>
                    <span className={`ml-2 text-gray-500 shrink-0 text-xs transition-transform ${dropdownOpen ? "rotate-180" : ""}`}>▾</span>
                  </button>
                  {dropdownOpen && (
                    <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-[#131720] border border-white/15 rounded-lg shadow-xl overflow-hidden">
                      {savedLeagues.map((l) => {
                        const isActive = l.id === leagueId;
                        const isEditing = editingLeagueId === l.id;
                        const displayLabel = l.label ?? l.teamName ?? `#${l.id}`;
                        return (
                          <div key={l.id} className={`flex items-center gap-2 px-3 py-2.5 transition-colors ${isActive ? "bg-[#e8193c]/10" : "hover:bg-white/5"}`}>
                            <span className={`shrink-0 text-xs ${isActive ? "text-green-400" : "text-transparent"}`}>✓</span>
                            {isEditing ? (
                              <input autoFocus type="text" value={editingLabel} onChange={(e) => setEditingLabel(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") saveLeagueLabel(l.id); if (e.key === "Escape") setEditingLeagueId(null); }}
                                onBlur={() => saveLeagueLabel(l.id)}
                                className="flex-1 bg-transparent border-none outline-none text-white text-sm min-w-0" placeholder={`#${l.id}`} />
                            ) : (
                              <button onClick={() => { activateLeague(l.id); setDropdownOpen(false); }} className={`flex-1 text-left text-sm truncate ${isActive ? "text-white" : "text-gray-300"}`}>
                                {displayLabel}
                              </button>
                            )}
                            <button onClick={() => { setEditingLeagueId(l.id); setEditingLabel(l.label ?? l.teamName ?? ""); }} title="Rename" className="text-gray-600 hover:text-gray-300 transition-colors shrink-0">✎</button>
                            <button onClick={() => removeLeague(l.id)} title="Remove" className="text-gray-600 hover:text-red-400 transition-colors shrink-0">×</button>
                          </div>
                        );
                      })}
                      <button onClick={() => { setLeagueId(""); setSaved(false); setEditingLeagueId(null); setDropdownOpen(false); }} className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors border-t border-white/8">
                        <span className="text-xs">+</span> Add League
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            <Field label="League ID" hint={`From your ESPN league URL: ${SPORT_URL_HINTS[sport]}`} value={leagueId} onChange={setLeagueId} placeholder="123456789" />
            <Field label="espn_s2" hint="Browser cookie — see step-by-step guide below if you need help finding it" value={espnS2} onChange={setEspnS2} placeholder="AEBxxxxxxxx…" mono />
            <Field label="SWID" hint="Browser cookie — same place as espn_s2. Includes curly braces." value={swid} onChange={setSwid} placeholder="{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}" mono />

            <div className="flex justify-center mt-1">
              <button onClick={handleSave} disabled={!leagueId || !espnS2 || !swid} className="bg-[#e8193c] hover:bg-[#c41234] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-8 rounded-lg transition-colors">
                {saved ? "Saved ✓" : "Save Settings"}
              </button>
            </div>
          </div>
        )}

        {/* ── Yahoo Tab ─────────────────────────────────────── */}
        {settingsTab === "yahoo" && (
          <div className="flex flex-col gap-5">
            <p className="text-xs text-gray-500 -mt-3">Connect your Yahoo Fantasy Basketball league using Sign in with Yahoo.</p>

            {/* Sport selector — NBA only */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-white">Sport</label>
              <div className="flex flex-wrap gap-2 mt-1">
                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border bg-[#e8193c] border-[#e8193c] text-white">
                  <span>🏀</span><span>NBA</span>
                </button>
                {([
                  { name: "WNBA", emoji: "🏀" },
                  { name: "NHL",  emoji: "🏒" },
                  { name: "MLB",  emoji: "⚾" },
                  { name: "NFL",  emoji: "🏈" },
                ] as const).map(s => (
                  <button key={s.name} disabled className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-white/5 text-gray-500 cursor-not-allowed">
                    <span className="absolute -top-2 -right-1 text-[9px] bg-[#1a1f2e] border border-amber-500/40 px-1 py-px rounded-full font-semibold text-amber-400/90 leading-none">Soon</span>
                    <span>{s.emoji}</span>
                    <span>{s.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* OAuth error banner */}
            {yahooOAuthError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-300 flex items-start justify-between gap-3">
                <p>{yahooOAuthError}</p>
                <button onClick={() => setYahooOAuthError(null)} className="text-red-400/60 hover:text-red-300 text-lg leading-none shrink-0 transition-colors">×</button>
              </div>
            )}

            {/* Primary CTA: Sign in with Yahoo (OAuth) */}
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={() => { window.location.href = "/api/yahoo/auth"; }}
                className="flex items-center justify-center gap-2 bg-[#720e9e] hover:bg-[#5a0b7d] text-white font-semibold py-3 px-6 rounded-lg transition-colors w-full text-base"
              >
                <span>🔑</span> {yahooAccessToken ? "Reconnect Yahoo" : "Sign in with Yahoo"}
              </button>
              <p className="text-xs text-gray-500">Redirects to Yahoo to authorize. Your league is fetched automatically.</p>
            </div>

            {/* Yahoo league dropdown */}
            {yahooLeagues.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-white">Your Yahoo NBA Leagues</label>
                <div className="relative" ref={yahooDropdownRef}>
                  <button
                    onClick={() => setYahooDropdownOpen(o => !o)}
                    className="flex items-center justify-between w-full px-3 py-2 rounded-lg text-sm border border-white/10 bg-[#0f1117] text-white hover:border-white/20 transition-colors"
                  >
                    <span className="truncate">
                      {(() => {
                        const active = yahooLeagues.find(l => l.key === yahooLeagueKey);
                        return active ? (active.label ?? active.teamName ?? active.key) : "Select a league…";
                      })()}
                    </span>
                    <span className={`ml-2 text-gray-500 shrink-0 text-xs transition-transform ${yahooDropdownOpen ? "rotate-180" : ""}`}>▾</span>
                  </button>
                  {yahooDropdownOpen && (
                    <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-[#131720] border border-white/15 rounded-lg shadow-xl overflow-hidden">
                      {yahooLeagues.map((l) => {
                        const isActive = l.key === yahooLeagueKey;
                        const isEditing = yahooEditingKey === l.key;
                        const displayLabel = l.label ?? l.teamName ?? l.key;
                        return (
                          <div key={l.key} className={`flex items-center gap-2 px-3 py-2.5 transition-colors ${isActive ? "bg-[#e8193c]/10" : "hover:bg-white/5"}`}>
                            <span className={`shrink-0 text-xs ${isActive ? "text-green-400" : "text-transparent"}`}>✓</span>
                            {isEditing ? (
                              <input autoFocus type="text" value={yahooEditingLabel} onChange={(e) => setYahooEditingLabel(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") saveYahooLeagueLabel(l.key); if (e.key === "Escape") setYahooEditingKey(null); }}
                                onBlur={() => saveYahooLeagueLabel(l.key)}
                                className="flex-1 bg-transparent border-none outline-none text-white text-sm min-w-0" placeholder={l.key} />
                            ) : (
                              <button onClick={() => { activateYahooLeague(l.key); setYahooDropdownOpen(false); }} className={`flex-1 text-left text-sm truncate ${isActive ? "text-white" : "text-gray-300"}`}>
                                {displayLabel}
                              </button>
                            )}
                            <button onClick={() => { setYahooEditingKey(l.key); setYahooEditingLabel(l.label ?? l.teamName ?? ""); }} title="Rename" className="text-gray-600 hover:text-gray-300 transition-colors shrink-0">✎</button>
                            <button onClick={() => removeYahooLeague(l.key)} title="Remove" className="text-gray-600 hover:text-red-400 transition-colors shrink-0">×</button>
                          </div>
                        );
                      })}
                      <button onClick={() => { setYahooLeagueKey(""); setYahooEditingKey(null); setYahooDropdownOpen(false); }} className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors border-t border-white/8">
                        <span className="text-xs">+</span> Add League
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Manual / Advanced — collapsible */}
            <details className="group">
              <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-300 select-none flex items-center gap-1.5">
                <span className="inline-block transition-transform group-open:rotate-90">▶</span>
                Or connect manually with cookies (advanced)
              </summary>
              <div className="flex flex-col gap-4 mt-4">
                {/* Yahoo Quick Connect bookmarklet */}
                <div className="border border-white/10 rounded-lg p-4 bg-black/10 flex flex-col gap-3">
                  <p className="text-sm font-semibold text-white">Bookmarklet — Yahoo <span className="text-xs text-gray-500 font-normal ml-1">(for B cookie, if OAuth doesn&apos;t work)</span></p>
                  <div className="flex items-start gap-2.5">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-purple-500/20 text-purple-400 text-[10px] font-bold flex items-center justify-center mt-0.5">1</span>
                    <div className="flex flex-col gap-2">
                      <p className="text-xs text-gray-300 font-medium">Drag this to your bookmarks bar <span className="text-gray-500">(don&apos;t click — drag it)</span></p>
                      <div className="flex flex-wrap items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                        <a
                          ref={yahooBookmarkRef}
                          href="#"
                          draggable
                          onClick={(e) => e.preventDefault()}
                          className="inline-flex items-center gap-2 bg-[#720e9e] hover:bg-[#5a0b7d] text-white text-sm font-semibold px-4 py-2.5 rounded-lg cursor-grab active:cursor-grabbing select-none transition-colors"
                        >
                          <span>⚡</span> Yahoo Fantasy Connect
                        </a>
                        <span className="text-xs text-gray-500">← drag to bookmarks bar</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-purple-500/20 text-purple-400 text-[10px] font-bold flex items-center justify-center mt-0.5">2</span>
                    <div className="flex flex-col gap-1.5">
                      <p className="text-xs text-gray-300">Open your Yahoo Fantasy Basketball league page</p>
                      <button
                        onClick={() => {
                          setYahooClickedBookmark(true);
                          window.location.href = "https://basketball.fantasysports.yahoo.com/";
                        }}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-300 hover:text-purple-200 transition-colors w-fit"
                      >
                        → Open basketball.fantasysports.yahoo.com
                      </button>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-purple-500/20 text-purple-400 text-[10px] font-bold flex items-center justify-center mt-0.5">3</span>
                    <p className="text-xs text-gray-300">On your league page, click <strong className="text-gray-200">Yahoo Fantasy Connect</strong> from your bookmarks bar</p>
                  </div>
                </div>

                {/* League URL auto-extractor */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-white">League URL <span className="text-gray-500 font-normal">(auto-fills League Key)</span></label>
                  <p className="text-xs text-gray-500">Paste your Yahoo Fantasy Basketball league URL and the League Key will fill automatically.</p>
                  <input
                    type="text"
                    value={yahooLeagueUrl}
                    onChange={(e) => {
                      const url = e.target.value;
                      setYahooLeagueUrl(url);
                      const m = url.match(/\/nba\/(\d+)/);
                      if (m) setYahooLeagueKey(`428.l.${m[1]}`);
                    }}
                    placeholder="basketball.fantasysports.yahoo.com/nba/123456/team/1"
                    className="w-full bg-[#0f1117] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#e8193c]/60 min-w-0"
                  />
                </div>

                <Field
                  label="League Key"
                  hint='Format: 428.l.{league_id} — auto-filled from the URL above, or enter manually.'
                  value={yahooLeagueKey}
                  onChange={setYahooLeagueKey}
                  placeholder="428.l.19877"
                  mono
                />
                <Field
                  label="B Cookie"
                  hint="Yahoo session cookie. Yahoo marks this HttpOnly — copy it manually from DevTools (see guide below)."
                  value={yahooB}
                  onChange={setYahooB}
                  placeholder="FH8aD1…"
                  mono
                />
                <Field
                  label="T Cookie"
                  hint="Optional secondary Yahoo cookie. Same DevTools approach as B Cookie."
                  value={yahooT}
                  onChange={setYahooT}
                  placeholder="z=…"
                  mono
                />

                <div className="flex justify-center mt-1">
                  <button
                    onClick={handleYahooSave}
                    disabled={!yahooLeagueKey || (!yahooB && !yahooAccessToken) || !isValidLeagueKey(yahooLeagueKey)}
                    className="bg-[#720e9e] hover:bg-[#5a0b7d] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-8 rounded-lg transition-colors"
                  >
                    {yahooSaved ? "Saved ✓" : "Save Yahoo Settings"}
                  </button>
                </div>
              </div>
            </details>
          </div>
        )}
      </div>

      {/* Quick Connect (ESPN) — outside Manual Setup card, always visible for ESPN tab */}
      {settingsTab === "espn" && (
        <div className="bg-[#1a1f2e] border border-white/10 rounded-xl p-6 mb-4">
          <h2 className="text-base font-semibold text-white mb-1">Quick Connect — ESPN</h2>
          <p className="text-xs text-gray-500 mb-5">
            Drag the button below to your bookmarks bar. Then open your ESPN Fantasy league page and click it.
          </p>
          <div className="flex flex-wrap items-center gap-4 mb-5">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              ref={bookmarkRef}
              href="#"
              draggable
              onClick={(e) => { e.preventDefault(); setClickedBookmark(true); setTimeout(() => setClickedBookmark(false), 3000); }}
              className="inline-flex items-center gap-2 bg-[#e8193c] hover:bg-[#c41234] text-white text-sm font-semibold px-4 py-2.5 rounded-lg cursor-grab active:cursor-grabbing select-none transition-colors"
            >
              <span>⚡</span> ESPN Fantasy Connect
            </a>
            <span className="text-xs text-gray-500">← drag to bookmarks bar</span>
          </div>
          {clickedBookmark && (
            <p className="text-xs text-yellow-400 mb-3">Don&apos;t click — drag it to your bookmarks bar instead!</p>
          )}
          <ol className="list-decimal list-inside space-y-1.5 text-xs text-gray-400">
            <li>Drag the button above to your browser&apos;s bookmarks bar</li>
            <li>
              Go to <strong className="text-gray-200">fantasy.espn.com</strong> and open your league page
              <span className="block text-gray-600 ml-4 mt-0.5">(URL should contain <code className="bg-white/5 px-1 rounded">leagueId=…</code>)</span>
            </li>
            <li>Click the bookmark — this page will reload with credentials pre-filled</li>
          </ol>
        </div>
      )}

      {/* ── Transfer to Phone ──────────────────────────────── */}
      {(leagueId && espnS2 && swid) || (yahooLeagueKey && (yahooB || yahooAccessToken)) ? (
        <div className="bg-[#1a1f2e] border border-white/10 rounded-xl p-6 mt-4">
          <h2 className="text-base font-semibold text-white mb-1">Transfer to Phone</h2>
          <p className="text-xs text-gray-500 mb-5">
            Scan this QR code to transfer all saved credentials (ESPN + Yahoo) to your phone at once.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="bg-white p-3 rounded-xl shrink-0">
              <QRCodeSVG value={typeof window !== "undefined" ? buildTransferUrl() : ""} size={160} />
            </div>
            <div className="flex flex-col gap-3 w-full">
              <p className="text-xs text-gray-400">Or copy the link and send it to your phone:</p>
              <button
                onClick={() => { navigator.clipboard.writeText(buildTransferUrl()); setCopied(true); setTimeout(() => setCopied(false), 2500); }}
                className="bg-white/10 hover:bg-white/15 text-white text-sm font-medium py-2.5 px-4 rounded-lg transition-colors"
              >
                {copied ? "Copied ✓" : "Copy Setup Link"}
              </button>
              <p className="text-xs text-gray-600">Opening the link on your phone will save credentials automatically.</p>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Manual cookie guide (ESPN, collapsible) ──────────────── */}
      {settingsTab === "espn" && (
        <details className="mt-4 group">
          <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-300 select-none">
            How to find ESPN cookies manually (step-by-step)
          </summary>
          <div className="mt-3 bg-[#1a1f2e] border border-white/10 rounded-xl p-5 space-y-2.5 text-sm text-gray-400">
            <Step n={1}>Open <strong className="text-white">Chrome</strong>, go to <Code>fantasy.espn.com</Code> and log in</Step>
            <Step n={2}>Navigate to your league — the URL will show <Code>leagueId=XXXXXXXX</Code> — copy that number</Step>
            <Step n={3}>Press <Kbd>F12</Kbd> to open DevTools</Step>
            <Step n={4}>Click the <strong className="text-white">Application</strong> tab in the top toolbar</Step>
            <Step n={5}>In the left panel expand <strong className="text-white">Cookies</strong> → click <Code>https://www.espn.com</Code></Step>
            <Step n={6}>Find <Code>espn_s2</Code> in the list — click it, then copy the full value from the bottom pane</Step>
            <Step n={7}>Find <Code>SWID</Code> — copy its value (it looks like <Code>{"{GUID}"}</Code>)</Step>
            <Step n={8}>Paste all three values into the fields above and click <strong className="text-white">Save Settings</strong></Step>
          </div>
        </details>
      )}

      {settingsTab === "yahoo" && (
        <details className="mt-4 group">
          <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-300 select-none">
            How to find your Yahoo B cookie manually (step-by-step)
          </summary>
          <div className="mt-3 bg-[#1a1f2e] border border-white/10 rounded-xl p-5 space-y-2.5 text-sm text-gray-400">
            <p className="text-xs text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded p-2">
              Yahoo marks the B cookie as <strong>HttpOnly</strong> — it cannot be read by JavaScript (including the bookmarklet). You must copy it from DevTools.
            </p>
            <Step n={1}>Go to <Code>basketball.fantasysports.yahoo.com/nba</Code> and log in to your Yahoo account</Step>
            <Step n={2}>Navigate to your league page — the URL will look like <Code>basketball.fantasysports.yahoo.com/nba/<strong>123456</strong>/team/…</Code></Step>
            <Step n={3}>Paste that URL into the <strong className="text-white">League URL</strong> field above — the League Key fills automatically</Step>
            <Step n={4}>Press <Kbd>F12</Kbd> to open DevTools</Step>
            <Step n={5}>Click the <strong className="text-white">Application</strong> tab → expand <strong className="text-white">Cookies</strong> in the left panel</Step>
            <Step n={6}>Click <Code>https://basketball.fantasysports.yahoo.com</Code> or <Code>https://www.yahoo.com</Code></Step>
            <Step n={7}>Find the <Code>B</Code> cookie — copy its full value (a long alphanumeric string)</Step>
            <Step n={8}>Optionally copy the <Code>T</Code> cookie value too</Step>
            <Step n={9}>Paste B (and T) into the fields above and click <strong className="text-white">Save Yahoo Settings</strong></Step>
          </div>
        </details>
      )}
    </div>
  );
}

function Field({
  label, hint, value, onChange, placeholder, mono,
}: {
  label: string; hint: string; value: string;
  onChange: (v: string) => void; placeholder?: string; mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold text-white">{label}</label>
      <p className="text-xs text-gray-500">{hint}</p>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full bg-[#0f1117] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#e8193c]/60 min-w-0 ${mono ? "font-mono" : ""}`}
      />
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-white/10 text-white text-xs flex items-center justify-center font-bold mt-0.5">{n}</span>
      <p>{children}</p>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="text-xs bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-gray-300">{children}</code>;
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="text-xs bg-white/10 border border-white/20 px-1.5 py-0.5 rounded font-mono text-gray-200">{children}</kbd>;
}
