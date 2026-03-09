"use client";

import Link from "next/link";
import { useSportConfig } from "@/hooks/useSportConfig";

const OPTIONS = [
  {
    href: "/trade",
    emoji: "🔄",
    title: "Trade Analyzer",
    description: "Compare two sets of players across your league's scoring categories.",
  },
  {
    href: "/compare",
    emoji: "📊",
    title: "Compare Teams",
    description: "Head-to-head stats comparison between any two teams over a custom week range.",
  },
  {
    href: "/power",
    emoji: "🏆",
    title: "Power Ranking",
    description: "Full round-robin simulation — see how every team stacks up against every other.",
  },
  { href: "/coach", emoji: "🤖", title: "AI Coach", description: "Weekly matchup insights and daily waiver pickups powered by AI.", soon: true },
  {
    href: "/settings",
    emoji: "⚙️",
    title: "Settings",
    description: "Set your ESPN league ID and cookies to connect your fantasy league.",
  },
];

export default function HomePage() {
  const sportConfig = useSportConfig();

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex flex-col items-center justify-start pt-8 sm:justify-center sm:pt-6 px-4">
      {/* Logo + tagline */}
      <div className="text-center mb-7">
        <div className="text-4xl mb-3">{sportConfig.emoji}</div>
        <h1 className="text-2xl font-bold text-white tracking-wide">Fantasy Tool</h1>
        <p className="text-gray-400 mt-1.5 text-xs max-w-xs mx-auto leading-relaxed">
          Your ESPN fantasy toolkit — analyze trades, compare teams, and rank your league.
        </p>
      </div>

      {/* Option cards */}
      <div className="w-full max-w-sm flex flex-col gap-2.5">
        {OPTIONS.map((opt) => {
          if (opt.soon) {
            return (
              <div
                key={opt.href}
                className="relative flex items-center gap-4 bg-[#1a1f2e] border border-white/5 rounded-xl px-4 py-3 opacity-50 cursor-not-allowed select-none"
              >
                <span className="absolute -top-2 right-3 text-[9px] bg-[#1a1f2e] border border-amber-500/40 px-1.5 py-px rounded-full font-semibold text-amber-400/90 leading-none">Soon</span>
                <span className="text-2xl shrink-0">{opt.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm">{opt.title}</p>
                  <p className="text-gray-500 text-xs mt-0.5 leading-snug">{opt.description}</p>
                </div>
              </div>
            );
          }
          return (
            <Link
              key={opt.href}
              href={opt.href}
              className="flex items-center gap-4 bg-[#1a1f2e] border border-white/10 rounded-xl px-4 py-3 hover:border-white/25 hover:bg-[#1f2540] transition-colors group"
            >
              <span className="text-2xl shrink-0">{opt.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm">{opt.title}</p>
                <p className="text-gray-500 text-xs mt-0.5 leading-snug">{opt.description}</p>
              </div>
              <svg
                className="shrink-0 text-gray-600 group-hover:text-gray-400 transition-colors"
                width="16" height="16" viewBox="0 0 16 16" fill="currentColor"
              >
                <path fillRule="evenodd" clipRule="evenodd"
                  d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06L7.28 12.78a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z" />
              </svg>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
