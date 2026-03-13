"use client";

import type { StatsWindow } from "@/lib/types";

const ALL_WINDOWS: { label: string; value: StatsWindow }[] = [
  { label: "Season", value: "season" },
  { label: "30D",    value: "30" },
  { label: "15D",    value: "15" },
  { label: "14D",    value: "14" },
  { label: "7D",     value: "7" },
  { label: "26 Proj", value: "proj" },
];

interface Props {
  value: StatsWindow;
  onChange: (w: StatsWindow) => void;
  /** If provided, only show windows in this list. Defaults to all windows. */
  availableWindows?: StatsWindow[];
  /** "sm" = compact (compare/power), "md" = slightly larger (trade page top bar). Default: "sm" */
  size?: "sm" | "md";
  /** Optional note shown below the tabs (e.g. off-season warning). */
  note?: string | null;
}

export function StatsWindowTabs({ value, onChange, availableWindows, size = "sm", note }: Props) {
  const windows = availableWindows
    ? ALL_WINDOWS.filter((w) => availableWindows.includes(w.value))
    : ALL_WINDOWS;

  const btnClass = size === "md"
    ? "px-3 py-1.5 rounded text-sm font-medium border transition-colors whitespace-nowrap"
    : "px-2.5 py-1 rounded text-xs font-medium border transition-colors whitespace-nowrap";

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex gap-1.5 flex-wrap">
        {windows.map((w) => (
          <button
            key={w.value}
            onClick={() => onChange(w.value)}
            className={`${btnClass} ${
              value === w.value
                ? "bg-[#e8193c] border-[#e8193c] text-white"
                : "border-white/10 text-gray-400 hover:text-white hover:border-white/20"
            }`}
          >
            {w.label}
          </button>
        ))}
      </div>
      {note && <p className="text-xs text-amber-400/80 mt-0.5">{note}</p>}
    </div>
  );
}
