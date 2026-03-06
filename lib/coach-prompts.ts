import { fmt, aggregateStats } from "./stat-calculator";
import type {
  AggregatedStats,
  CoachAdviceType,
  LeagueScoringConfig,
  PlayerStats,
} from "./types";

// ─── System prompts ────────────────────────────────────────────────────────────

export function buildSystemPrompt(adviceType: CoachAdviceType): string {
  const lengthInstruction =
    adviceType === "daily"
      ? "Each insight must be 1–2 sentences max."
      : "Each insight may be 1–4 sentences — use more detail only when the data warrants it.";

  return (
    `You are an expert fantasy sports coach. Be specific, data-driven, and actionable. ` +
    `Use **bold** for player names and key stats. ` +
    `${lengthInstruction} ` +
    `Respond with ONLY numbered insights in this exact format:\n` +
    `1. [insight]\n2. [insight]\n...\n` +
    `No preamble, no closing sentence, no extra text outside the numbered list.`
  );
}

// ─── Stats formatting helper ───────────────────────────────────────────────────

function formatStats(stats: AggregatedStats, config: LeagueScoringConfig): string {
  if (config.format === "points") {
    return `FPts:${fmt(stats["FPts"] ?? 0, "FPts")}`;
  }
  return config.cats
    .map((cat) => {
      const val = stats[cat.id] ?? 0;
      const label = cat.lowerIsBetter ? `${cat.id}(↓)` : cat.id;
      return `${label}:${fmt(val, cat.id)}`;
    })
    .join(" ");
}

function catList(config: LeagueScoringConfig): string {
  if (config.format === "points") return "Points league (FPts)";
  return config.cats
    .map((c) => (c.lowerIsBetter ? `${c.id}(↓lower=better)` : c.id))
    .join(", ");
}

// ─── Weekly matchup prompt ─────────────────────────────────────────────────────

export function buildWeeklyPrompt(params: {
  sportName: string;
  scoringConfig: LeagueScoringConfig;
  myTeamName: string;
  myStats: AggregatedStats;
  opponentName: string;
  opponentStats: AggregatedStats;
}): string {
  const { sportName, scoringConfig, myTeamName, myStats, opponentName, opponentStats } = params;

  const lines = [
    `Sport: ${sportName} | Format: ${scoringConfig.format}`,
    `Scoring categories: ${catList(scoringConfig)}`,
    ``,
    `My team (${myTeamName}) stats per game: ${formatStats(myStats, scoringConfig)}`,
    `Opponent (${opponentName}) stats per game: ${formatStats(opponentStats, scoringConfig)}`,
    ``,
    `Provide exactly 5 numbered strategic insights for this week's H2H matchup. ` +
    `Focus on: categories where I have a clear edge (protect them), categories where I'm ` +
    `behind (how to close the gap or accept the loss), and any roster moves that could help.`,
  ];

  return lines.join("\n");
}

// ─── Daily waiver pickup prompt ────────────────────────────────────────────────

export function buildDailyPrompt(params: {
  sportName: string;
  scoringConfig: LeagueScoringConfig;
  myTeamName: string;
  myStats: AggregatedStats;
  opponentName: string;
  opponentStats: AggregatedStats;
  freeAgents: Array<PlayerStats & { gamesThisWeek?: number }>;
}): string {
  const { sportName, scoringConfig, myTeamName, myStats, opponentName, opponentStats, freeAgents } =
    params;

  const faLines = freeAgents
    .slice(0, 20)
    .map((p) => {
      const gamesTag = p.gamesThisWeek != null ? `, ${p.gamesThisWeek}g this week` : "";
      const playerStats = aggregateStats([p], scoringConfig);
      const statsStr = formatStats(playerStats, scoringConfig);
      return `- **${p.playerName}** (${p.position}${gamesTag}): ${statsStr}`;
    })
    .join("\n");

  const lines = [
    `Sport: ${sportName} | Format: ${scoringConfig.format}`,
    `Scoring categories: ${catList(scoringConfig)}`,
    ``,
    `My team (${myTeamName}) stats: ${formatStats(myStats, scoringConfig)}`,
    `Opponent this week (${opponentName}) stats: ${formatStats(opponentStats, scoringConfig)}`,
    ``,
    `Available free agents (top 20 by matchup relevance):`,
    faLines,
    ``,
    `Provide exactly 5 numbered waiver pickup recommendations. For each: ` +
    `name the player, explain why they help win this specific matchup, and which ` +
    `roster player they should replace (if applicable). Be concise — 1–2 sentences each.`,
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
  const {
    sportName,
    scoringConfig,
    myTeamName,
    myStats,
    leagueAvgStats,
    strongCats,
    weakCats,
    allTeams,
  } = params;

  const otherTeams = allTeams
    .filter((t) => t.name !== myTeamName)
    .map((t) => {
      const roster = t.roster.slice(0, 8).join(", ");
      return `${t.name}: ${formatStats(t.stats, scoringConfig)} | Roster: ${roster}`;
    })
    .join("\n");

  const lines = [
    `Sport: ${sportName} | Format: ${scoringConfig.format}`,
    `Scoring categories: ${catList(scoringConfig)}`,
    ``,
    `My team (${myTeamName}):`,
    `  Stats: ${formatStats(myStats, scoringConfig)}`,
    `  League avg: ${formatStats(leagueAvgStats, scoringConfig)}`,
    `  My strengths (above avg): ${strongCats.join(", ") || "none"}`,
    `  My weaknesses (below avg): ${weakCats.join(", ") || "none"}`,
    ``,
    `Other teams:`,
    otherTeams,
    ``,
    `Provide exactly 3 numbered trade package suggestions. ` +
    `Format each as: "Send [player(s)] to [team name], receive [player(s)]. Reason: [1–2 sentences]." ` +
    `Focus on fixing my weakest categories by trading away surplus from my strengths.`,
  ];

  return lines.join("\n");
}

// ─── Free agent ranking algorithm ─────────────────────────────────────────────

/**
 * Rank free agents by their ability to help win the current matchup.
 * Primary signal: how much they contribute to categories where I'm currently losing.
 * Secondary signal: overall 30-day production.
 */
export function rankFreeAgents(
  freeAgents: PlayerStats[],
  myStats: AggregatedStats,
  opponentStats: AggregatedStats,
  config: LeagueScoringConfig
): PlayerStats[] {
  if (config.format === "points") {
    // Points league: just sort by raw points production
    return [...freeAgents].sort((a, b) => b.pts - a.pts);
  }

  // Identify categories where I'm losing this matchup
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

      // Normalize by a rough scale for each category type
      const scale = cat.id.endsWith("%") ? 0.5 : Math.max(Math.abs(opponentStats[cat.id] ?? 1), 1);
      const normalized = val / scale;

      if (losingCats.some((lc) => lc.id === cat.id)) {
        matchupScore += normalized * 2; // double weight for losing cats
      }
      productionScore += normalized;
    }

    return { player: p, score: matchupScore + productionScore * 0.3 };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .map((s) => s.player);
}
