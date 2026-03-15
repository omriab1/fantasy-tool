"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { useSportConfig } from "@/hooks/useSportConfig";
import type { FantasyProvider } from "@/lib/types";

const TABS = [
  { lines: ["Trade", "Analyzer"],  href: "/trade" },
  { lines: ["Compare", "Teams"],   href: "/compare" },
  { lines: ["Power", "Ranking"],   href: "/power" },
  { lines: ["Matchup", "Planner"], href: "/matchup" },
  // AI Coach hidden — to re-enable: uncomment the line below
  // { lines: ["AI", "Coach"],       href: "/coach", soon: true },
  { lines: ["Settings"],           href: "/settings" },
];

/** Read the active fantasy provider from localStorage (SSR-safe). */
function readProvider(): FantasyProvider {
  if (typeof window === "undefined") return "espn";
  return (localStorage.getItem("fantasy_provider") as FantasyProvider | null) ?? "espn";
}

export function NavTabs() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const sportConfig = useSportConfig();

  // Provider state + dropdown
  const [provider, setProvider] = useState<FantasyProvider>("espn");
  const [providerOpen, setProviderOpen] = useState(false);
  const providerRef = useRef<HTMLDivElement>(null);

  // Close menu whenever the route changes
  useEffect(() => { setOpen(false); }, [pathname]);

  // Sync provider from localStorage on mount and on settings change
  useEffect(() => {
    function sync() { setProvider(readProvider()); }
    sync();
    window.addEventListener("fantasy-settings-changed", sync);
    return () => window.removeEventListener("fantasy-settings-changed", sync);
  }, []);

  // Close provider dropdown when clicking outside
  useEffect(() => {
    if (!providerOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (providerRef.current && !providerRef.current.contains(e.target as Node)) {
        setProviderOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [providerOpen]);

  function switchProvider(p: FantasyProvider) {
    localStorage.setItem("fantasy_provider", p);
    setProvider(p);
    setProviderOpen(false);
    window.dispatchEvent(new Event("fantasy-settings-changed"));
  }

  const providerLabel = provider === "yahoo" ? "Yahoo" : "ESPN";

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#1a1f2e] border-b border-white/10">
        <div className="max-w-5xl mx-auto flex items-center h-14 px-3">
          <Link href="/homepage" className="text-white font-bold text-sm tracking-widest uppercase shrink-0 hover:text-gray-300 transition-colors">
            {sportConfig.emoji} Fantasy Tool · {sportConfig.name}
          </Link>

          {/* Desktop: inline tab row */}
          <div className="hidden sm:flex gap-1 ml-6">
            {TABS.map((tab) => {
              const active = pathname.startsWith(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`px-3 py-1.5 rounded text-center transition-colors flex flex-col items-center justify-center ${
                    active
                      ? "bg-[#e8193c] text-white"
                      : "text-gray-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {tab.lines.map((line, i) => (
                    <span key={i} className="block text-xs font-medium leading-tight">{line}</span>
                  ))}
                </Link>
              );
            })}
          </div>

          {/* Provider badge — top-right, before mobile hamburger */}
          <div className="ml-auto flex items-center gap-2">
            <div className="relative" ref={providerRef}>
              <button
                onClick={() => setProviderOpen(v => !v)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold border border-white/15 text-gray-300 hover:text-white hover:border-white/30 transition-colors bg-white/5"
                title="Switch fantasy provider"
              >
                <span>{providerLabel}</span>
                <span className={`text-gray-500 text-[10px] transition-transform ${providerOpen ? "rotate-180" : ""}`}>▾</span>
              </button>

              {providerOpen && (
                <div className="absolute right-0 top-full mt-1 w-32 bg-[#131720] border border-white/15 rounded-lg shadow-xl overflow-hidden z-50">
                  {(["espn", "yahoo"] as FantasyProvider[]).map(p => (
                    <button
                      key={p}
                      onClick={() => switchProvider(p)}
                      className={`flex items-center gap-2 w-full px-3 py-2.5 text-sm text-left transition-colors ${
                        provider === p
                          ? "text-white bg-[#e8193c]/10"
                          : "text-gray-400 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      <span className={`text-xs ${provider === p ? "text-green-400" : "text-transparent"}`}>✓</span>
                      <span className="font-medium">{p === "espn" ? "ESPN" : "Yahoo"}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Mobile: hamburger button */}
            <button
              onClick={() => setOpen((v) => !v)}
              className="sm:hidden p-2 text-gray-400 hover:text-white transition-colors"
              aria-label="Menu"
            >
              {open ? (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" clipRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" clipRule="evenodd"
                    d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {open && (
          <div className="sm:hidden border-t border-white/10 bg-[#1a1f2e]">
            {TABS.map((tab) => {
              const active = pathname.startsWith(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`flex items-center px-5 py-3.5 text-sm font-medium transition-colors border-b border-white/5 ${
                    active
                      ? "text-white bg-[#e8193c]/20 border-l-2 border-l-[#e8193c]"
                      : "text-gray-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {tab.lines.join(" ")}
                </Link>
              );
            })}
            {/* Provider selector in mobile menu */}
            <div className="flex items-center gap-2 px-5 py-3 border-b border-white/5">
              <span className="text-xs text-gray-500 font-medium">Provider:</span>
              {(["espn", "yahoo"] as FantasyProvider[]).map(p => (
                <button
                  key={p}
                  onClick={() => { switchProvider(p); setOpen(false); }}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                    provider === p
                      ? "bg-[#e8193c] text-white"
                      : "text-gray-400 hover:text-white border border-white/10"
                  }`}
                >
                  {p === "espn" ? "ESPN" : "Yahoo"}
                </button>
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* Overlay to close menu when tapping outside */}
      {open && (
        <div
          className="sm:hidden fixed inset-0 z-40"
          onClick={() => setOpen(false)}
        />
      )}
    </>
  );
}
