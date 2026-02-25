"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { label: "Trade", href: "/trade" },
  { label: "Compare", href: "/compare" },
  { label: "Settings", href: "/settings" },
];

export function NavTabs() {
  const pathname = usePathname();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#1a1f2e] border-b border-white/10">
      <div className="max-w-5xl mx-auto flex items-center h-14 px-4">
        <span className="text-white font-bold text-sm tracking-widest uppercase mr-8 shrink-0">
          🏀 Fantasy Tool
        </span>
        <div className="flex gap-1">
          {TABS.map((tab) => {
            const active = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                  active
                    ? "bg-[#e8193c] text-white"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
