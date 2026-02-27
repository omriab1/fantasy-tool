"use client";

import type { StatsWindow } from "@/lib/types";

const ALL_WINDOWS: { label: string; value: StatsWindow }[] = [
  { label: "Season", value: "season" },
  { label: "30D", value: "30" },
  { label: "15D", value: "15" },
  { label: "7D", value: "7" },
];

interface Props {
  value: StatsWindow;
  onChange: (w: StatsWindow) => void;
  /** If provided, only show windows in this list. Defaults to all four windows. */
  availableWindows?: StatsWindow[];
}

export function StatsWindowTabs({ value, onChange, availableWindows }: Props) {
  const windows = availableWindows
    ? ALL_WINDOWS.filter((w) => availableWindows.includes(w.value))
    : ALL_WINDOWS;

  return (
    <div className="flex gap-1 bg-[#0f1117] p-1 rounded-lg w-fit overflow-x-auto">
      {windows.map((w) => (
        <button
          key={w.value}
          onClick={() => onChange(w.value)}
          className={`px-4 py-1.5 rounded text-sm font-medium whitespace-nowrap transition-colors ${
            value === w.value
              ? "bg-[#e8193c] text-white"
              : "text-gray-400 hover:text-white"
          }`}
        >
          {w.label}
        </button>
      ))}
    </div>
  );
}
