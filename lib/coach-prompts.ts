import { fmt, aggregateStats } from "./stat-calculator";
import type {
  AggregatedStats,
  CoachAdviceType,
  LeagueScoringConfig,
  PlayerStats,
  ScoringCat,
} from "./types";

// ─── System prompts ────────────────────────────────────────────────────────────

export function buildSystemPrompt(adviceType: CoachAdviceType): string {
  return (
    `You are an expert fantasy sports coach. ` +
    `RULES: (1) Every insight MUST quote specific numbers from the data provided — never give generic advice. ` +
    `(2) Use **bold** for player names and stat values. ` +
    `(3) 1–2 sentences max per insight. ` +
    `(4) Respond with ONLY a numbered list — no preamble, no closing text.\n` +
    `Format: 1. [insight]\n2. [insight]\n...`
  );
}

// ─── Stats helpers ─────────────────────────────────────────────────────────────

function fmtVal(val: number, cat: ScoringCat): string {
  return fmt(val, cat.id);
}

/**
 * Build a per-category delta table:
 * "- STL: me 8.2 vs opp 7.1 → LEAD +1.1"
 * "- PTS: me 112 vs opp 120 → BEHIND -8.0"
 * "- TO(↓): me 14.2 vs opp 13.1 → BEHIND +1.1"
 */
function buildDeltaTable(
  myStats: AggregatedStats,
  oppStats: AggregatedStats,
  config: LeagueScoringConfig
): string {
  if (config.format === "points") {
    const mine = myStats["FPts"] ?? 0;
    const theirs = oppStats["FPts"] ?? 0;
    const diff = mine - theirs;
    const status = diff >= 0 ? `LEAD +${fmt(diff, "FPts")}` : `BEHIND ${fmt(diff, "FPts")}`;
    return `- FPts: me ${fmt(mine, "FPts")} vs opp ${fmt(theirs, "FPts")} → ${status}`;
  }

  return config.cats
    .map((cat) => {
      const mine = myStats[cat.id] ?? 0;
      const theirs = oppStats[cat.id] ?? 0;
      const diff = mine - theirs;
      const leading = cat.lowerIsBetter ? diff <= 0 : diff >= 0;
      const label = cat.lowerIsBetter ? `${cat.id}(↓)` : cat.id;
      const absDiff = Math.abs(diff);
      const status = leading
        ? `LEAD +${fmtVal(absDiff, cat)}`
        : `BEHIND -${fmtVal(absDiff, cat)}`;
      return `- ${label}: me ${fmtVal(mine, cat)} vs opp ${fmtVal(theirs, cat)} → ${status}`;
    })
    .join("\n");
}

// ─── Weekly matchup prompt ─────────────────────────────────────────────────────

export function buildWeeklyPrompt(params: {
  sportName: string;
  scoringConfig: LeagueScoringConfig;
  myTeamName: string;
  myRoster: string[];
  myStats: AggregatedStats;
  opponentName: string;
  opponentRoster: string[];
  opponentStats: AggregatedStats;
}): string {
  const { sportName, scoringConfig, myTeamName, myRoster, myStats, opponentName, opponentRoster, opponentStats } = params;

  const lines = [
    `Sport: ${sportName} | Format: ${scoringConfig.format}`,
    ``,
    `My team (${myTeamName}) roster: ${myRoster.join(", ")}`,
    `Opponent (${opponentName}) roster: ${opponentRoster.join(", ")}`,
    ``,
    `Category breakdown (30-day stats):`,
    buildDeltaTable(myStats, opponentStats, scoringConfig),
    ``,
    `Give exactly 5 numbered insights. Reference specific players by name and cite the exact numbers above. ` +
    `Cover: categories I lead (how to protect), categories I'm behind (how to close), key player matchups.`,
  ];

  return lines.join("\n");
}

// ─── Daily waiver pickup prompt ────────────────────────────────────────────────

export function buildDailyPrompt(params: {
  sportName: string;
  scoringConfig: LeagueScoringConfig;
  myTeamName: string;
  myRoster: Array<{ name: string; position: string }>;
  myStats: AggregatedStats;
  opponentName: string;
  opponentStats: AggregatedStats;
  freeAgents: Array<PlayerStats & { gamesThisWeek?: number }>;
}): string {
  const { sportName, scoringConfig, myTeamName, myRoster, myStats, opponentName, opponentStats, freeAgents } = params;

  const rosterStr = myRoster.map((p) => `${p.name} (${p.position})`).join(", ");

  // Categories I'm losing — show to focus AI on what matters
  const losingLines = scoringConfig.format === "points" ? [] : scoringConfig.cats
    .filter((cat) => {
      const mine = myStats[cat.id] ?? 0;
      const theirs = opponentStats[cat.id] ?? 0;
      return cat.lowerIsBetter ? mine > theirs : mine < theirs;
    })
    .map((cat) => {
      const mine = myStats[cat.id] ?? 0;
      const theirs = opponentStats[cat.id] ?? 0;
      const gap = Math.abs(mine - theirs);
      return `  ${cat.id}: me ${fmtVal(mine, cat)} vs opp ${fmtVal(theirs, cat)} (gap ${fmtVal(gap, cat)})`;
    });

  const faLines = freeAgents
    .slice(0, 20)
    .map((p) => {
      const gamesTag = p.gamesThisWeek != null ? `, ${p.gamesThisWeek}g this week` : "";
      const playerStats = aggregateStats([p], scoringConfig);
      const statsStr = scoringConfig.format === "points"
        ? `FPts:${fmt(playerStats["FPts"] ?? 0, "FPts")}`
        : scoringConfig.cats
            .map((cat) => `${cat.id}:${fmtVal(playerStats[cat.id] ?? 0, cat)}`)
            .join(" ");
      return `- **${p.playerName}** (${p.position}${gamesTag}): ${statsStr}`;
    })
    .join("\n");

  const lines = [
    `Sport: ${sportName} | Format: ${scoringConfig.format}`,
    ``,
    `My team (${myTeamName}) roster: ${rosterStr}`,
    ``,
    losingLines.length > 0
      ? `Categories I'm currently LOSING vs ${opponentName}:\n${losingLines.join("\n")}`
      : `I'm leading all categories vs ${opponentName}.`,
    ``,
    `Available free agents ONLY — recommend ONLY from this list:`,
    faLines,
    ``,
    `Give exactly 5 numbered pickup recommendations from the list above. ` +
    `For each: name the free agent with their key stat (e.g. "**X** averages **2.1 STL**"), ` +
    `state which roster player to drop, and tie it to a specific losing category gap.`,
  ];

  return lines.join("\n");
}

// ─── Trade ideas prompt ────────────────────────────────────────────────────────

export function buildTradePrompt(params: {
  sportName: string;
  scoringConfig: LeagueScoringConfig;
  myTeamName: string;
  myStats: AggregatedStats;
  leagueAvgStats: AggregatedStats;
  strongCats: string[];
  weakCats: string[];
  allTeams: Array<{ name: string; stats: AggregatedStats; roster: string[] }>;
}): string {
  const { sportName, scoringConfig, myTeamName, myStats, leagueAvgStats, strongCats, weakCats, allTeams } = params;

  // Build delta vs league avg
  const avgDeltaLines = scoringConfig.format === "points"
    ? [`FPts: me ${fmt(myStats["FPts"] ?? 0, "FPts")} vs avg ${fmt(leagueAvgStats["FPts"] ?? 0, "FPts")}`]
    : scoringConfig.cats.map((cat) => {
        const mine = myStats[cat.id] ?? 0;
        const avg = leagueAvgStats[cat.id] ?? 0;
        const diff = mine - avg;
        const leading = cat.lowerIsBetter ? diff <= 0 : diff >= 0;
        const label = cat.lowerIsBetter ? `${cat.id}(↓)` : cat.id;
        const status = leading ? `+${fmtVal(Math.abs(diff), cat)} above avg` : `-${fmtVal(Math.abs(diff), cat)} below avg`;
        return `  ${label}: ${fmtVal(mine, cat)} (${status})`;
      });

  const otherTeams = allTeams
    .filter((t) => t.name !== myTeamName)
    .map((t) => {
      const roster = t.roster.slice(0, 8).join(", ");
      const statsStr = scoringConfig.format === "points"
        ? `FPts:${fmt(t.stats["FPts"] ?? 0, "FPts")}`
        : scoringConfig.cats.map((cat) => `${cat.id}:${fmtVal(t.stats[cat.id] ?? 0, cat)}`).join(" ");
      return `${t.name} | ${statsStr} | Roster: ${roster}`;
    })
    .join("\n");

  const lines = [
    `Sport: ${sportName} | Format: ${scoringConfig.format}`,
    ``,
    `My team (${myTeamName}) vs league average:`,
    avgDeltaLines.join("\n"),
    `Strengths: ${strongCats.join(", ") || "none"} | Weaknesses: ${weakCats.join(", ") || "none"}`,
    ``,
    `Other teams:`,
    otherTeams,
    ``,
    `Give exactly 3 numbered trade packages. ` +
    `Format: "Send **[player]** to **[team]**, receive **[player]**. [1 sentence with specific stat numbers explaining why.]" ` +
    `Trade from my strengths to fix my weaknesses. Only suggest players from the rosters listed above.`,
  ];

  return lines.join("\n");
}

// ─── Free agent ranking algorithm ─────────────────────────────────────────────

export function rankFreeAgents(
  freeAgents: PlayerStats[],
  myStats: AggregatedStats,
  opponentStats: AggregatedStats,
  config: LeagueScoringConfig
): PlayerStats[] {
  if (config.format === "points") {
    return [...freeAgents].sort((a, b) => b.pts - a.pts);
  }

  const losingCats = config.cats.filter((cat) => {
    const mine = myStats[cat.id] ?? 0;
    const theirs = opponentStats[cat.id] ?? 0;
    return cat.lowerIsBetter ? mine > theirs : mine < theirs;
  });

  const scored = freeAgents.map((p) => {
    const gp = Math.max(p.gp, 1);
    let matchupScore = 0;
    let productionScore = 0;

    for (const cat of config.cats) {
      const val = cat.compute(p.rawStats, gp);
      if (isNaN(val) || !isFinite(val)) continue;

      const scale = cat.id.endsWith("%") ? 0.5 : Math.max(Math.abs(opponentStats[cat.id] ?? 1), 1);
      const normalized = val / scale;

      if (losingCats.some((lc) => lc.id === cat.id)) {
        matchupScore += normalized * 2;
      }
      productionScore += normalized;
    }

    return { player: p, score: matchupScore + productionScore * 0.3 };
  });

  return scored.sort((a, b) => b.score - a.score).map((s) => s.player);
}
