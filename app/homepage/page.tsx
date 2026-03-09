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
    <div className="min-h-[calc(100vh-3.5rem)] flex flex-col items-center justify-start pt-1 sm:justify-center sm:pt-0 px-4">
      {/* Logo + tagline */}
      <div className="text-center mb-5">
        <div className="text-4xl mb-3">{sportConfig.emoji}</div>
        <h1 className="text-2xl font-bold text-white tracking-wide">Fantasy Tool</h1>
        <p className="text-gray-400 mt-1.5 text-xs max-w-xs mx-auto leading-relaxed">
          Your ESPN fantasy toolkit — analyze trades, compare teams, and rank your league.
        </p>
      </div>

      {/* Option cards — 2-col mobile, 3-col desktop */}
      <div className="w-full max-w-2xl grid grid-cols-2 sm:grid-cols-3 gap-3">
        {OPTIONS.map((opt) => {
          if (opt.soon) {
            return (
              <div
                key={opt.href}
                className="relative flex flex-col items-center text-center bg-[#1a1f2e] border border-white/5 rounded-xl px-3 py-4 opacity-50 cursor-not-allowed select-none"
              >
                <span className="absolute -top-2 right-3 text-[9px] bg-[#1a1f2e] border border-amber-500/40 px-1.5 py-px rounded-full font-semibold text-amber-400/90 leading-none">Soon</span>
                <span className="text-3xl mb-2">{opt.emoji}</span>
                <p className="text-white font-semibold text-sm">{opt.title}</p>
                <p className="text-gray-500 text-xs mt-1 leading-snug">{opt.description}</p>
              </div>
            );
          }
          return (
            <Link
              key={opt.href}
              href={opt.href}
              className="flex flex-col items-center text-center bg-[#1a1f2e] border border-white/10 rounded-xl px-3 py-4 hover:border-white/25 hover:bg-[#1f2540] transition-colors"
            >
              <span className="text-3xl mb-2">{opt.emoji}</span>
              <p className="text-white font-semibold text-sm">{opt.title}</p>
              <p className="text-gray-500 text-xs mt-1 leading-snug">{opt.description}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
