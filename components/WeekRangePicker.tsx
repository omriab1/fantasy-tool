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
  const maxMatchup = currentPeriod;
  const matchups = Array.from({ length: maxMatchup }, (_, i) => i + 1);

  function applyPreset(n: number) {
    const end = Math.max(1, currentPeriod - 1); // last completed matchup
    const start = Math.max(1, end - n + 1);
    onStartChange(start);
    onEndChange(end);
  }

  function applyCurrent() {
    onStartChange(currentPeriod);
    onEndChange(currentPeriod);
  }

  const lastCompleted = Math.max(1, currentPeriod - 1);
  const isCurrent = startPeriod === currentPeriod && endPeriod === currentPeriod;

  return (
    <div className="flex flex-col gap-3">
      {/* Quick presets */}
      <div>
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={applyCurrent}
            className={`px-2 py-1 rounded text-xs font-medium border transition-colors ${
              isCurrent
                ? "bg-[#e8193c] border-[#e8193c] text-white"
                : "border-white/10 text-gray-400 hover:text-white hover:border-white/20"
            }`}
          >
            Current Matchup
          </button>
          {PRESETS.map((n) => {
            const presetEnd = lastCompleted;
            const presetStart = Math.max(1, presetEnd - n + 1);
            const active = !isCurrent && endPeriod - startPeriod + 1 === n && endPeriod === presetEnd;
            return (
              <button
                key={n}
                onClick={() => applyPreset(n)}
                className={`px-2 py-1 rounded text-xs font-medium border transition-colors ${
                  active
                    ? "bg-[#e8193c] border-[#e8193c] text-white"
                    : "border-white/10 text-gray-400 hover:text-white hover:border-white/20"
                }`}
              >
                Last {n}m
              </button>
            );
          })}
          <button
            onClick={() => { onStartChange(1); onEndChange(lastCompleted); }}
            className={`px-2 py-1 rounded text-xs font-medium border transition-colors ${
              !isCurrent && startPeriod === 1 && endPeriod === lastCompleted
                ? "bg-[#e8193c] border-[#e8193c] text-white"
                : "border-white/10 text-gray-400 hover:text-white hover:border-white/20"
            }`}
          >
            Season
          </button>
        </div>
        <p className="hidden sm:block text-xs text-gray-600 mt-2">
          Quick select uses completed matchups only (besides Current Matchup). To include specific matchups, set the range manually below.
        </p>
      </div>

      {/* Manual range */}
      <div className="flex items-center gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 uppercase tracking-widest">Start matchup</label>
          <select
            value={startPeriod}
            onChange={(e) => onStartChange(Number(e.target.value))}
            className="bg-[#0f1117] border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#e8193c]/60"
          >
            {matchups.map((m) => (
              <option key={m} value={m} disabled={m > endPeriod}>
                Matchup {m}
              </option>
            ))}
          </select>
        </div>
        <span className="text-gray-600 mt-5">→</span>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 uppercase tracking-widest">End matchup</label>
          <select
            value={endPeriod}
            onChange={(e) => onEndChange(Number(e.target.value))}
            className="bg-[#0f1117] border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#e8193c]/60"
          >
            {matchups.map((m) => (
              <option key={m} value={m} disabled={m < startPeriod}>
                Matchup {m}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
