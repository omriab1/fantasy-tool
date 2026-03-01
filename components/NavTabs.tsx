"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { useSportConfig } from "@/hooks/useSportConfig";

const TABS = [
  { lines: ["Trade", "Analyzer"], href: "/trade" },
  { lines: ["Compare", "Teams"],  href: "/compare" },
  { lines: ["Power", "Ranking"],  href: "/power" },
  { lines: ["Settings"],          href: "/settings" },
];

export function NavTabs() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const sportConfig = useSportConfig();

  // Close menu whenever the route changes
  useEffect(() => { setOpen(false); }, [pathname]);

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

          {/* Mobile: hamburger button (right side) */}
          <button
            onClick={() => setOpen((v) => !v)}
            className="sm:hidden ml-auto p-2 text-gray-400 hover:text-white transition-colors"
            aria-label="Menu"
          >
            {open ? (
              /* X icon */
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" clipRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" />
              </svg>
            ) : (
              /* Hamburger icon */
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" clipRule="evenodd"
                  d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" />
              </svg>
            )}
          </button>
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
