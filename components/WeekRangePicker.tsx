"use client";

const PRESETS = [1, 2, 3, 4, 6, 8];

interface Props {
  currentPeriod: number;
  startPeriod: number;
  endPeriod: number;
  onStartChange: (p: number) => void;
  onEndChange: (p: number) => void;
}

export function WeekRangePicker({ currentPeriod, startPeriod, endPeriod, onStartChange, onEndChange }: Props) {
  const maxWeek = currentPeriod;
  const weeks = Array.from({ length: maxWeek }, (_, i) => i + 1);

  function applyPreset(n: number) {
    const end = Math.max(1, currentPeriod - 1); // last completed week
    const start = Math.max(1, end - n + 1);
    onStartChange(start);
    onEndChange(end);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Quick presets */}
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Quick select</p>
        <div className="flex gap-2 flex-wrap">
          {PRESETS.map((n) => (
            <button
              key={n}
              onClick={() => applyPreset(n)}
              className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
                endPeriod - startPeriod + 1 === n && endPeriod === Math.max(1, currentPeriod - 1)
                  ? "bg-[#e8193c] border-[#e8193c] text-white"
                  : "border-white/10 text-gray-400 hover:text-white hover:border-white/20"
              }`}
            >
              Last {n}w
            </button>
          ))}
        </div>
      </div>

      {/* Manual range */}
      <div className="flex items-center gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 uppercase tracking-widest">Start week</label>
          <select
            value={startPeriod}
            onChange={(e) => onStartChange(Number(e.target.value))}
            className="bg-[#0f1117] border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#e8193c]/60"
          >
            {weeks.map((w) => (
              <option key={w} value={w} disabled={w > endPeriod}>
                Week {w}
              </option>
            ))}
          </select>
        </div>
        <span className="text-gray-600 mt-5">→</span>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 uppercase tracking-widest">End week</label>
          <select
            value={endPeriod}
            onChange={(e) => onEndChange(Number(e.target.value))}
            className="bg-[#0f1117] border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#e8193c]/60"
          >
            {weeks.map((w) => (
              <option key={w} value={w} disabled={w < startPeriod}>
                Week {w}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
