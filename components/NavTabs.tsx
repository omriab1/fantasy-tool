"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { lines: ["Trade", "Analyzer"], href: "/trade" },
  { lines: ["Compare", "Teams"],  href: "/compare" },
  { lines: ["Power", "Ranking"],  href: "/power" },
  { lines: ["Settings"],          href: "/settings" },
];

export function NavTabs() {
  const pathname = usePathname();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#1a1f2e] border-b border-white/10">
      <div className="max-w-5xl mx-auto flex items-center min-h-14 px-3">
        <span className="text-white font-bold text-sm tracking-widest uppercase mr-2 sm:mr-8 shrink-0">
          🏀 Fantasy Tool
        </span>
        <div className="flex gap-1">
          {TABS.map((tab) => {
            const active = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`px-2 sm:px-3 py-1.5 rounded text-center transition-colors flex flex-col items-center justify-center ${
                  active
                    ? "bg-[#e8193c] text-white"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
              >
                {tab.lines.map((line, i) => (
                  <span key={i} className="block text-xs font-medium leading-tight">
                    {line}
                  </span>
                ))}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
