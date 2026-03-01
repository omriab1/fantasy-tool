"use client";

import { useState, useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { clearCache } from "@/lib/espn-cache";
import { useLeague } from "@/hooks/useLeague";
import { scoringConfigLabel } from "@/lib/scoring-config";
import { SPORT_CONFIGS } from "@/lib/sports-config";
import type { EspnSport } from "@/lib/types";

type ConnectedInfo = { label: string; emoji: string; name: string };

// ESPN league URL pattern per sport (for hint text in the League ID field)
const SPORT_URL_HINTS: Record<EspnSport, string> = {
  fba:  "fantasy.espn.com/basketball/league?leagueId={ID}",
  wnba: "fantasy.espn.com/basketball/league?leagueId={ID}",
  flb:  "fantasy.espn.com/baseball/league?leagueId={ID}",
  fhl:  "fantasy.espn.com/hockey/league?leagueId={ID}",
  ffl:  "fantasy.espn.com/football/league?leagueId={ID}",
};

// Only sports that are fully supported — others shown as "coming soon"
const ACTIVE_SPORTS: EspnSport[] = ["fba", "wnba"];
const COMING_SOON_SPORTS: EspnSport[] = ["flb", "fhl", "ffl"];

export default function SettingsPage() {
  const [sport, setSport] = useState<EspnSport>("fba");
  const [leagueId, setLeagueId] = useState("");
  const [espnS2, setEspnS2] = useState("");
  const [swid, setSwid] = useState("");
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [clickedBookmark, setClickedBookmark] = useState(false);
  const [autoResult, setAutoResult] = useState<{ s2: boolean; swid: boolean; leagueId: boolean } | null>(null);
  // Persisted league info — loaded immediately from localStorage so the banner
  // shows on return visits before the league state has loaded from cache.
  const [savedConnectedInfo, setSavedConnectedInfo] = useState<ConnectedInfo | null>(null);
  const bookmarkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.get("auto") === "1") {
      // Bookmarklet redirect — merge detected values with any existing saved values.
      // Use sport from URL param if present, otherwise use currently saved sport.
      const paramS2     = params.get("s2") ?? "";
      const paramSwid   = params.get("swid") ?? "";
      const paramLid    = params.get("leagueId") ?? "";
      const paramSport  = (params.get("sport") as EspnSport | null) ?? null;

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
        clearCache(lid);
        setSaved(true);
      }

      // Clean the URL so refreshing doesn't re-trigger
      window.history.replaceState({}, "", "/settings");
    } else {
      const storedSport = (localStorage.getItem("espn_sport") as EspnSport | null) ?? "fba";
      const validSport  = storedSport in SPORT_CONFIGS ? storedSport : "fba";
      setSport(validSport);
      // Fall back to legacy key only for NBA (fba) — other sports must use their own saved ID
      const leagueIdFallback = validSport === "fba" ? (localStorage.getItem("espn_leagueId") ?? "") : "";
      setLeagueId(localStorage.getItem(`espn_leagueId_${validSport}`) ?? leagueIdFallback);
      setEspnS2(localStorage.getItem("espn_s2") ?? "");
      setSwid(localStorage.getItem("espn_swid") ?? "");
    }
  }, []);

  // When sport changes: load that sport's saved leagueId and immediately persist the sport
  // so the navbar updates in real-time.
  function handleSportChange(newSport: EspnSport) {
    setSport(newSport);
    const savedLid = localStorage.getItem(`espn_leagueId_${newSport}`) ?? "";
    setLeagueId(savedLid);
    setSaved(false);
    // Persist sport immediately so NavTabs reflects the change without requiring Save
    localStorage.setItem("espn_sport", newSport);
    window.dispatchEvent(new Event("espn-settings-changed"));
  }

  // Generate bookmarklet pointing to this app's origin — set via ref to avoid React's javascript: sanitization
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
      `var m=location.href.match(/[?&]leagueId=(\\d+)/);` +
      `var lid=m?m[1]:'';` +
      `var sp=localStorage.getItem('espn_sport')||'fba';` +
      `location.href='${origin}/settings?auto=1&leagueId='+encodeURIComponent(lid)+'&s2='+encodeURIComponent(s2)+'&swid='+encodeURIComponent(sw)+'&sport='+encodeURIComponent(sp);` +
    `})();`;
    bookmarkRef.current.href = code;
  }, []);

  const { league, scoringConfig } = useLeague(leagueId, espnS2, swid, sport);
  const sportCfg = SPORT_CONFIGS[sport];

  // Load persisted connected info for the current sport immediately on mount / sport change.
  // This ensures the banner shows right away on return visits before league state loads from cache.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`espn_last_connected_${sport}`);
      setSavedConnectedInfo(raw ? (JSON.parse(raw) as ConnectedInfo) : null);
    } catch {
      setSavedConnectedInfo(null);
    }
  }, [sport]);

  // Save connected info whenever the league loads — keeps the persisted data fresh.
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

  // Auto-save credentials whenever the league loads successfully — no Save button needed
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
    window.dispatchEvent(new Event("espn-settings-changed"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league?.leagueId]);

  function handleSave() {
    const lid = leagueId.trim();
    const s2  = espnS2.trim();
    const sw  = swid.trim();
    localStorage.setItem("espn_sport", sport);
    localStorage.setItem(`espn_leagueId_${sport}`, lid);
    localStorage.setItem("espn_s2", s2);
    localStorage.setItem("espn_swid", sw);
    clearCache(lid);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const allAutoDetected = autoResult?.s2 && autoResult?.swid && autoResult?.leagueId;
  const partialAutoDetected = autoResult && !allAutoDetected;
  const offSeason = league && league.scoringPeriodId === 0;

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-white mb-2">Settings</h1>
      <p className="text-gray-500 text-sm mb-8">
        Connect to your ESPN Fantasy league. Credentials are stored only in your browser.
      </p>


      {/* League loaded banner — shows scoring config above Quick Connect.
          Uses savedConnectedInfo as instant fallback so it appears on page return
          before the league state has been re-loaded from cache. */}
      {(league || savedConnectedInfo) && (() => {
        const info: ConnectedInfo = league
          ? { label: scoringConfigLabel(scoringConfig), emoji: sportCfg.emoji, name: sportCfg.name }
          : savedConnectedInfo!;
        return (
          <div className="mb-3 bg-green-500/10 border border-green-500/25 rounded-lg p-4 text-sm space-y-1">
            <p className="font-semibold text-white flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-green-500/20 text-green-400 text-xs font-bold shrink-0">✓</span>
              {info.emoji} {info.name} league connected
            </p>
            <p className="font-mono text-gray-400 pl-7">{info.label}</p>
            <p className="text-gray-600 pl-7 text-xs pt-1">Changed your ESPN league settings? Click Save Settings to force-refresh.</p>
          </div>
        );
      })()}

      {/* Off-season banner */}
      {offSeason && (
        <div className="mb-6 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 text-sm text-yellow-300">
          {sportCfg.name} is in off-season — stat windows will show the most recent completed season data.
        </div>
      )}

      {/* Auto-detect result banner */}
      {allAutoDetected && (
        <div className="mb-6 bg-green-500/10 border border-green-500/20 rounded-lg p-4 text-sm text-green-300">
          All credentials detected and saved automatically. You&apos;re ready to go!
        </div>
      )}
      {partialAutoDetected && (
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

      {/* ── Quick Connect ──────────────────────────────────── */}
      <div className="bg-[#1a1f2e] border border-white/10 rounded-xl p-6 mb-4">
        <h2 className="text-base font-semibold text-white mb-1">Quick Connect</h2>
        <p className="text-xs text-gray-500 mb-5">
          Drag the button below to your bookmarks bar. Then open your ESPN Fantasy league page and click it — your credentials will fill in automatically.
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
          <p className="text-xs text-yellow-400 mb-3">
            Don&apos;t click — drag it to your bookmarks bar instead!
          </p>
        )}

        <ol className="list-decimal list-inside space-y-1.5 text-xs text-gray-400">
          <li>Drag the button above to your browser&apos;s bookmarks bar</li>
          <li>
            Go to <strong className="text-gray-200">fantasy.espn.com</strong> and open your league page
            <span className="block text-gray-600 ml-4 mt-0.5">
              (URL should contain <code className="bg-white/5 px-1 rounded">leagueId=…</code>)
            </span>
          </li>
          <li>Click the bookmark — this page will reload with credentials pre-filled</li>
        </ol>
      </div>

      {/* Compact league confirmation — shown between Quick Connect and Manual Setup */}
      {(league || savedConnectedInfo) && (
        <div className="flex items-center gap-2 mb-2 px-1">
          <span className="flex items-center justify-center w-4 h-4 rounded-full bg-green-500/20 text-green-400 text-xs font-bold shrink-0">✓</span>
          <span className="text-xs text-green-400 font-medium">
            Connected to {league ? sportCfg.emoji : savedConnectedInfo!.emoji}{" "}
            {league ? sportCfg.name : savedConnectedInfo!.name}
          </span>
        </div>
      )}

      {/* ── Manual Setup ──────────────────────────────────── */}
      <div className="bg-[#1a1f2e] border border-white/10 rounded-xl p-6">
        <h2 className="text-base font-semibold text-white mb-1">Manual Setup</h2>
        <p className="text-xs text-gray-500 mb-5">Or paste your credentials directly.</p>

        <div className="flex flex-col gap-5">
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
                  <button
                    key={s}
                    disabled
                    className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-white/5 text-gray-500 cursor-not-allowed"
                  >
                    <span className="absolute -top-2 -right-1 text-[9px] bg-[#1a1f2e] border border-amber-500/40 px-1 py-px rounded-full font-semibold text-amber-400/90 leading-none">Soon</span>
                    <span>{c.emoji}</span>
                    <span>{c.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <Field
            label="League ID"
            hint={`From your ESPN league URL: ${SPORT_URL_HINTS[sport]}`}
            value={leagueId}
            onChange={setLeagueId}
            placeholder="123456789"
          />
          <Field
            label="espn_s2"
            hint="Browser cookie — see step-by-step guide below if you need help finding it"
            value={espnS2}
            onChange={setEspnS2}
            placeholder="AEBxxxxxxxx…"
            mono
          />
          <Field
            label="SWID"
            hint="Browser cookie — same place as espn_s2. Includes curly braces."
            value={swid}
            onChange={setSwid}
            placeholder="{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}"
            mono
          />

          <div className="flex justify-center mt-1">
            <button
              onClick={handleSave}
              disabled={!leagueId || !espnS2 || !swid}
              className="bg-[#e8193c] hover:bg-[#c41234] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-8 rounded-lg transition-colors"
            >
              {saved ? "Saved ✓" : "Save Settings"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Transfer to Phone ──────────────────────────────── */}
      {leagueId && espnS2 && swid && (
        <div className="bg-[#1a1f2e] border border-white/10 rounded-xl p-6 mt-4">
          <h2 className="text-base font-semibold text-white mb-1">Transfer to Phone</h2>
          <p className="text-xs text-gray-500 mb-5">
            Scan this QR code with your phone camera to open the app with your credentials pre-loaded.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="bg-white p-3 rounded-xl shrink-0">
              <QRCodeSVG
                value={`${typeof window !== "undefined" ? window.location.origin : ""}/settings?auto=1&leagueId=${encodeURIComponent(leagueId)}&s2=${encodeURIComponent(espnS2)}&swid=${encodeURIComponent(swid)}&sport=${encodeURIComponent(sport)}`}
                size={160}
              />
            </div>
            <div className="flex flex-col gap-3 w-full">
              <p className="text-xs text-gray-400">Or copy the link and send it to your phone:</p>
              <button
                onClick={() => {
                  const url = `${window.location.origin}/settings?auto=1&leagueId=${encodeURIComponent(leagueId)}&s2=${encodeURIComponent(espnS2)}&swid=${encodeURIComponent(swid)}&sport=${encodeURIComponent(sport)}`;
                  navigator.clipboard.writeText(url);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2500);
                }}
                className="bg-white/10 hover:bg-white/15 text-white text-sm font-medium py-2.5 px-4 rounded-lg transition-colors"
              >
                {copied ? "Copied ✓" : "Copy Setup Link"}
              </button>
              <p className="text-xs text-gray-600">
                Opening the link on your phone will save credentials automatically.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Manual cookie guide (collapsible) ──────────────── */}
      <details className="mt-4 group">
        <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-300 select-none">
          How to find cookies manually (step-by-step)
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
