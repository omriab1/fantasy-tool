import { fmt, aggregateStats } from "./stat-calculator";
import type {
  AggregatedStats,
  CoachAdviceType,
  LeagueScoringConfig,
  PlayerStats,
  ScoringCat,
} from "./types";

// ─── Pro-team abbreviation lookup (ESPN proTeamId → abbreviation) ─────────────

const NBA_PRO_TEAM: Record<number, string> = {
  0: "FA",
  1: "ATL", 2: "BOS", 3: "NOP", 4: "CHI", 5: "CLE",
  6: "DAL", 7: "DEN", 8: "DET", 9: "GSW", 10: "HOU",
  11: "IND", 12: "LAC", 13: "LAL", 14: "MEM", 15: "MIA",
  16: "MIL", 17: "MIN", 18: "BKN", 19: "NYK", 20: "ORL",
  21: "PHI", 22: "PHX", 23: "POR", 24: "SAC", 25: "SAS",
  26: "OKC", 27: "TOR", 28: "UTA", 29: "WAS",
};

function proTeamAbbr(teamIdStr: string, sport?: string): string {
  if (sport === "fba" || sport === "wnba") {
    const abbr = NBA_PRO_TEAM[Number(teamIdStr)];
    return abbr ?? "";
  }
  return "";
}

// ─── System prompts ────────────────────────────────────────────────────────────

export function buildSystemPrompt(adviceType: CoachAdviceType): string {
  return (
    `You are an expert fantasy sports coach. ` +
    `RULES: (1) Every insight MUST quote specific numbers from the data — never give generic advice. ` +
    `(2) Use **bold** for player names, team names, category names, and key stat values. Use *italics* for the stat window or time period (e.g., *over the last 30 days*, *this season*, *30d*, *15d*). ` +
    `(3) 1 sentence max per insight — be direct, specific, and concise. ` +
    `(4) Respond with ONLY a numbered list — no preamble, no closing text.\n` +
    `Format: 1. [insight]\n2. [insight]\n...`
  );
}

// ─── Stats helpers ─────────────────────────────────────────────────────────────

function fmtVal(val: number, cat: ScoringCat): string {
  return fmt(val, cat.id);
}

/** Per-player stat table: "  - **Name** (POS): PTS:24.2 REB:8.1 ..." */
function formatRosterStats(players: PlayerStats[], config: LeagueScoringConfig, maxPlayers = 8): string {
  if (players.length === 0) return "  (no players)";
  return players
    .slice(0, maxPlayers)
    .map((p) => {
      const ps = aggregateStats([p], config);
      const statsStr =
        config.format === "points"
          ? `FPts:${fmt(ps["FPts"] ?? 0, "FPts")}`
          : config.cats.map((cat) => `${cat.id}:${fmtVal(ps[cat.id] ?? 0, cat)}`).join(" ");
      return `  - **${p.playerName}** (${p.position}): ${statsStr}`;
    })
    .join("\n");
}

/**
 * Build a per-category delta table (30d baseline):
 * "- STL: me 8.2 vs opp 7.1 → LEAD +1.1"
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

/**
 * Build a per-category gap table across multiple time windows.
 * Positive gap = I'm ahead; negative = I'm behind (sign-adjusted for lowerIsBetter).
 *
 * windows: [{ label: "season"|"30d"|"15d"|"7d", my: AggregatedStats, opp: AggregatedStats }]
 * Windows with no data (empty my stats) are automatically skipped.
 *
 * Example output:
 *   "(+ = I lead, - = behind  |  season = full year  |  30d = last 3-4 matchups  |  ...)"
 *   "- PTS:   season -8.0  |  30d -5.2  |  15d -3.1  |  7d +0.5"
 *   "- REB:   season +4.5  |  30d +3.2  |  15d +2.0  |  7d +1.1"
 */
function buildTrendTable(
  windows: Array<{ label: string; my: AggregatedStats; opp: AggregatedStats }>,
  config: LeagueScoringConfig
): string {
  const active = windows.filter((w) => Object.keys(w.my).length > 0);
  if (active.length === 0) return "(no data available)";

  const WINDOW_LABELS: Record<string, string> = {
    season: "season = full year",
    "30d": "30d = last 3-4 matchups",
    "15d": "15d = last 2 weeks",
    "7d": "7d = this week",
  };
  const legend = active.map((w) => WINDOW_LABELS[w.label] ?? w.label).join("  |  ");
  const header = `(+ = I lead, - = behind  |  ${legend})`;

  if (config.format === "points") {
    const parts = active.map((w) => {
      const gap = (w.my["FPts"] ?? 0) - (w.opp["FPts"] ?? 0);
      return `${w.label} ${gap >= 0 ? "+" : "-"}${fmt(Math.abs(gap), "FPts")}`;
    });
    return `${header}\n- FPts: ${parts.join("  |  ")}`;
  }

  const rows = config.cats.map((cat) => {
    const label = cat.lowerIsBetter ? `${cat.id}(↓)` : cat.id;
    const parts = active.map((w) => {
      const mine = w.my[cat.id] ?? 0;
      const theirs = w.opp[cat.id] ?? 0;
      const gap = cat.lowerIsBetter ? theirs - mine : mine - theirs;
      return `${w.label} ${gap >= 0 ? "+" : "-"}${fmtVal(Math.abs(gap), cat)}`;
    });
    return `- ${label}: ${parts.join("  |  ")}`;
  });

  return `${header}\n${rows.join("\n")}`;
}

// ─── Weekly matchup prompt ─────────────────────────────────────────────────────

export function buildWeeklyPrompt(params: {
  sportName: string;
  scoringConfig: LeagueScoringConfig;
  myTeamName: string;
  opponentName: string;
  myStats30: AggregatedStats;
  oppStats30: AggregatedStats;
  myStatsSeason?: AggregatedStats;
  oppStatsSeason?: AggregatedStats;
  myStats15?: AggregatedStats;
  oppStats15?: AggregatedStats;
  myMatchupAvgs?: AggregatedStats;
  oppMatchupAvgs?: AggregatedStats;
  matchupWeeks?: number;
  /** Last ~3 matchup weeks — used for Insight 1 (recent momentum) */
  myMatchupAvgs3w?: AggregatedStats;
  oppMatchupAvgs3w?: AggregatedStats;
  matchupWeeks3w?: number;
  /** Pre-season projections — fallback when no real matchup data yet */
  myStatsProj?: AggregatedStats;
  oppStatsProj?: AggregatedStats;
}): string {
  const {
    sportName, scoringConfig, myTeamName, opponentName,
    myStats30, oppStats30, myStatsSeason, oppStatsSeason,
    myStats15, oppStats15,
    myMatchupAvgs, oppMatchupAvgs, matchupWeeks,
    myMatchupAvgs3w, oppMatchupAvgs3w, matchupWeeks3w,
    myStatsProj, oppStatsProj,
  } = params;

  const numCats = scoringConfig.cats.length;
  const winCats = Math.floor(numCats / 2) + 1;
  const formatNote = scoringConfig.format === "categories"
    ? ` | ${numCats}-cat H2H — need ${winCats}+ cats to win`
    : "";

  const hasSeasonData  = myStatsSeason   && Object.keys(myStatsSeason).length  > 0;
  const has15dData     = myStats15       && Object.keys(myStats15).length      > 0;
  const hasMatchupData = myMatchupAvgs   && oppMatchupAvgs && Object.keys(myMatchupAvgs).length  > 0;
  const has3wData      = myMatchupAvgs3w && oppMatchupAvgs3w && Object.keys(myMatchupAvgs3w).length > 0
                         && (matchupWeeks3w ?? 0) > 0;
  const hasProjData    = myStatsProj     && Object.keys(myStatsProj).length    > 0;
  // Use a separate Section E when the 3-week window covers fewer weeks than the full history
  const use3wSection   = has3wData && (matchupWeeks3w ?? 0) < (matchupWeeks ?? 0);
  const wksLabel = matchupWeeks ? `${matchupWeeks}` : "several";
  const wks3Label = matchupWeeks3w ? `${matchupWeeks3w}` : "3";

  // ── Precompute category priority (prevents AI writing about dominant safe leads) ──
  // Use matchup avgs as the base truth; fall back to 30d.
  const priorityMy  = hasMatchupData ? myMatchupAvgs! : myStats30;
  const priorityOpp = hasMatchupData ? oppMatchupAvgs! : oppStats30;

  const trailing: string[] = [];  // I'm behind — must recover
  const closeGap:  string[] = [];  // gap ≤ 20% of the value — worth fighting
  const safeLead:  string[] = [];  // I'm comfortably ahead — skip

  if (scoringConfig.format === "categories") {
    for (const cat of scoringConfig.cats) {
      const mine   = priorityMy[cat.id]  ?? 0;
      const theirs = priorityOpp[cat.id] ?? 0;
      const norm   = Math.max(Math.abs(mine), Math.abs(theirs), 0.001);
      // relGap > 0 → I'm worse; relGap < 0 → I'm ahead
      const relGap = cat.lowerIsBetter ? (mine - theirs) / norm : (theirs - mine) / norm;
      if (relGap > 0.02)        trailing.push(cat.id);
      else if (relGap > -0.20)  closeGap.push(cat.id);
      else                      safeLead.push(cat.id);
    }
  }

  const lines: string[] = [
    `Sport: ${sportName} | Format: ${scoringConfig.format}${formatNote}`,
    `My team: ${myTeamName} | Opponent: ${opponentName}`,
  ];

  // Category priority list — shown BEFORE data so AI uses it as a hard filter
  if (trailing.length > 0 || closeGap.length > 0) {
    lines.push(
      ``,
      `CATEGORY FOCUS (use ONLY these in your insights):`,
      ...[
        trailing.length > 0 ? `  Trailing — ${myTeamName} is behind (must recover): ${trailing.join(", ")}` : "",
        closeGap.length > 0 ? `  Close gap (worth fighting for): ${closeGap.join(", ")}` : "",
        safeLead.length > 0 ? `  SKIP — comfortable leads, do NOT write about these: ${safeLead.join(", ")}` : "",
      ].filter(Boolean)
    );
  }

  // Data sections — labeled [A]–[E]/[P] so per-insight instructions reference them unambiguously
  lines.push(
    ``,
    `[Section A] 30-day per-game averages:`,
    buildDeltaTable(myStats30, oppStats30, scoringConfig),
  );

  if (hasSeasonData) {
    lines.push(
      ``,
      `[Section B] Season per-game averages:`,
      buildDeltaTable(myStatsSeason!, oppStatsSeason ?? {}, scoringConfig)
    );
  }

  if (has15dData) {
    lines.push(
      ``,
      `[Section C] 15-day per-game averages:`,
      buildDeltaTable(myStats15!, oppStats15 ?? {}, scoringConfig)
    );
  }

  if (hasMatchupData) {
    lines.push(
      ``,
      `[Section D] Full-season matchup scoring averages (${wksLabel} completed weeks):`,
      buildDeltaTable(myMatchupAvgs!, oppMatchupAvgs!, scoringConfig)
    );
  }

  if (use3wSection) {
    lines.push(
      ``,
      `[Section E] Recent matchup scoring averages (last ${wks3Label} weeks only):`,
      buildDeltaTable(myMatchupAvgs3w!, oppMatchupAvgs3w!, scoringConfig)
    );
  }

  if (!hasMatchupData && hasProjData) {
    lines.push(
      ``,
      `[Section P] Pre-season projections (no matchup history yet):`,
      buildDeltaTable(myStatsProj!, oppStatsProj ?? {}, scoringConfig)
    );
  }

  // ── Per-insight section assignments ──
  // Insight 1 → recent trend (Section E if available, else Section D, else Section P, else Section A)
  const win1 = use3wSection
    ? `[Section E] — label comparison type as *last ${wks3Label} weeks of actual scoring*`
    : hasMatchupData
    ? `[Section D] — label comparison type as *${wksLabel} weeks of actual scoring*`
    : hasProjData
    ? `[Section P] — label comparison type as *projections*`
    : `[Section A] — label comparison type as *30-day averages*`;

  // Insight 2 → full-season matchup trend
  const win2 = hasMatchupData
    ? `[Section D] — label comparison type as *${wksLabel} weeks of actual scoring*`
    : hasProjData
    ? `[Section P] — label comparison type as *projections* (pick a different category than Insight 1)`
    : `[Section A] — label comparison type as *30-day averages* (pick a different category than Insight 1)`;

  const win4 = hasSeasonData
    ? `[Section B] — label comparison type as *season averages*`
    : `[Section A] — label comparison type as *30-day averages* (pick a different category than Insight 3)`;
  const win5 = has15dData
    ? `[Section C] — label comparison type as *15-day averages*`
    : `[Section A] — label comparison type as *30-day averages* (pick a different category than Insights 3–4)`;

  lines.push(
    ``,
    `Write EXACTLY 5 insights. Each must follow this format: "Based on *[comparison type]*, **${myTeamName}** leads/trails **[CAT]** **[my value]** vs **${opponentName}** **[their value]**. [One concrete action]."`,
    `Insight 1 → ${win1}`,
    `Insight 2 → ${win2}`,
    `Insight 3 → [Section A] — label as *30-day averages*`,
    `Insight 4 → ${win4}`,
    `Insight 5 → ${win5}`,
    `RULES: (1) Choose categories ONLY from "Trailing" or "Close gap" lists, NEVER from "SKIP". (2) Bold both **${myTeamName}** and **${opponentName}** every time, never use "I", "me", "we". (3) No em dashes. (4) Never use the word "deficit". (5) Include specific numbers for both sides.`
  );

  return lines.join("\n");
}

// ─── Daily waiver pickup prompt ────────────────────────────────────────────────

export function buildDailyPrompt(params: {
  sportName: string;
  sport?: string;
  scoringConfig: LeagueScoringConfig;
  myTeamName: string;
  myRoster: Array<{ name: string; position: string }>;
  myStats: AggregatedStats;
  opponentName: string;
  opponentStats: AggregatedStats;
  freeAgents: Array<PlayerStats & {
    gamesThisWeek?: number;
    hasRelevantGame?: boolean;
    windows?: Partial<Record<string, PlayerStats>>;
  }>;
}): string {
  const { sportName, sport, scoringConfig, myTeamName, myRoster, myStats, opponentName, opponentStats, freeAgents } = params;

  const rosterStr = myRoster.map((p) => `${p.name} (${p.position})`).join(", ");

  // Full ScoringCat objects needed for window selection scoring
  const losingCatObjs = scoringConfig.format === "points" ? [] : scoringConfig.cats.filter((cat) => {
    const mine = myStats[cat.id] ?? 0;
    const theirs = opponentStats[cat.id] ?? 0;
    return cat.lowerIsBetter ? mine > theirs : mine < theirs;
  });
  const losingCats = losingCatObjs.map((cat) => cat.id);
  // Exclude TO from window scoring — players are never picked primarily to lower your turnovers
  const losingNonToCats = losingCatObjs.filter((cat) => cat.id !== "TO");
  const toIsLosing = losingCats.includes("TO");

  function pickBestWindow(
    p: PlayerStats & { windows?: Partial<Record<string, PlayerStats>> }
  ): { label: string; data: PlayerStats } {
    const wins = p.windows;
    if (!wins) return { label: "30d", data: p };
    // 7d excluded from primary selection — too short a sample; it's shown as context only.
    const ORDER = ["15d", "30d", "season"] as const;
    if (losingNonToCats.length > 0) {
      let bestLabel = "30d";
      let bestData: PlayerStats = wins["30d"] ?? p;
      let bestScore = -Infinity;
      for (const win of ORDER) {
        const wp = wins[win];
        if (!wp) continue;
        const agg = aggregateStats([wp], scoringConfig);
        let score = 0;
        for (const cat of losingNonToCats) {
          const val = agg[cat.id] ?? 0;
          score += cat.lowerIsBetter ? -val : val;
        }
        if (score > bestScore) { bestScore = score; bestLabel = win; bestData = wp; }
      }
      return { label: bestLabel, data: bestData };
    }
    // No actionable losing cats: prefer most recent non-7d window with data
    for (const win of ORDER) {
      if (wins[win]) return { label: win, data: wins[win]! };
    }
    return { label: "30d", data: p };
  }

  function formatFA(p: PlayerStats & {
    gamesThisWeek?: number;
    hasRelevantGame?: boolean;
    windows?: Partial<Record<string, PlayerStats>>;
  }): string {
    const gamesTag = p.gamesThisWeek != null ? `, ${p.gamesThisWeek}g left` : "";
    const teamAbbr = proTeamAbbr(p.teamAbbrev, sport);
    const teamTag = teamAbbr ? `, ${teamAbbr}` : "";
    const { label, data } = pickBestWindow(p);
    const playerStats = aggregateStats([data], scoringConfig);
    const statsStr = scoringConfig.format === "points"
      ? `FPts:${fmt(playerStats["FPts"] ?? 0, "FPts")}`
      : scoringConfig.cats.map((cat) => `${cat.id}:${fmtVal(playerStats[cat.id] ?? 0, cat)}`).join(" ");
    return `- **${p.playerName}** (${p.position}${teamTag}${gamesTag}) [${label}]: ${statsStr}`;
  }

  // Players with a game in the upcoming scoring period come first
  const relevantFAs = freeAgents.filter((p) => p.hasRelevantGame).slice(0, 15);
  const otherFAs    = freeAgents.filter((p) => !p.hasRelevantGame).slice(0, 5);

  const faSection: string[] = [];
  if (relevantFAs.length > 0) {
    faSection.push(`Free agents with games in the upcoming scoring period:`);
    relevantFAs.forEach((p) => faSection.push(formatFA(p)));
  }
  if (otherFAs.length > 0) {
    faSection.push(`Other free agents (no game in upcoming period):`);
    otherFAs.forEach((p) => faSection.push(formatFA(p)));
  }

  const lines = [
    `Sport: ${sportName} | Format: ${scoringConfig.format}`,
    ``,
    `My team (${myTeamName}) roster: ${rosterStr}`,
    ``,
    losingCats.length > 0
      ? `Categories ${myTeamName} is currently trailing vs ${opponentName}: ${losingCats.join(", ")}`
      : `${myTeamName} leads all categories vs ${opponentName}.`,
    ``,
    `Available free agents (stat window shown in brackets next to each player):`,
    faSection.join("\n"),
    ``,
    `Give exactly 5 numbered pickup recommendations, prioritizing players from the "upcoming scoring period" section. ` +
    `Include the player's team abbreviation in parentheses right after the name (e.g., **Bam Adebayo** (MIA)). ` +
    `Mention all relevant losing categories this player helps close — not just one. ` +
    `For each category you mention, include the specific stat value in **bold** right after it (e.g., **REB** **9.2**, **AST** **6.1**). ` +
    (toIsLosing
      ? `TO is a trailing category — do NOT make it the primary pickup reason; mention it only as a bonus if the player has especially low turnovers. `
      : ``) +
    `End each recommendation with only the stat window name in *italics*, e.g., "*(30d)*" or "*(season)*". ` +
    `Do not suggest who to drop. Never use "I", "me", or "your". No em dashes. ` +
    `Example: "Pick up **Bam Adebayo** (MIA). Strengthens ${myTeamName}'s **REB** (**9.2**) and **AST** (**6.1**), two categories trailing ${opponentName} *(15d)*."`,
  ];

  return lines.join("\n");
}

// ─── Trade ideas prompt ────────────────────────────────────────────────────────

export function buildTradePrompt(params: {
  sportName: string;
  scoringConfig: LeagueScoringConfig;
  myTeamName: string;
  myStats: AggregatedStats;
  myRoster: PlayerStats[];
  leagueAvgStats: AggregatedStats;
  strongCats: string[];
  weakCats: string[];
  allTeams: Array<{ name: string; stats: AggregatedStats; roster: string[]; playerStats: PlayerStats[] }>;
}): string {
  const { sportName, scoringConfig, myTeamName, myStats, myRoster, leagueAvgStats, strongCats, weakCats, allTeams } = params;

  const numCats = scoringConfig.cats.length;
  const winCats = Math.floor(numCats / 2) + 1;
  const strategyContext = scoringConfig.format === "categories"
    ? `H2H ${numCats}-cat: win ${winCats}/${numCats} cats to win each matchup. ` +
      `Surplus cats (${strongCats.join(", ") || "none"}) are trade chips — send them away for deficit cats. ` +
      `Deficit cats (${weakCats.join(", ") || "none"}) need upgrades. ` +
      `Punting 1-2 furthest-behind cats to dominate ${winCats}+ is a proven strategy.`
    : scoringConfig.format === "points"
    ? `Points league: maximize total FPts. Trade for high-volume, high-floor players.`
    : `Roto league: balanced production across all categories wins — avoid giving up any category.`;

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
      const statsStr = scoringConfig.format === "points"
        ? `FPts:${fmt(t.stats["FPts"] ?? 0, "FPts")}`
        : scoringConfig.cats.map((cat) => `${cat.id}:${fmtVal(t.stats[cat.id] ?? 0, cat)}`).join(" ");
      const topPlayersStr = t.playerStats.length > 0
        ? ` | Top players: ${t.playerStats.map((p) => {
            const ps = aggregateStats([p], scoringConfig);
            const pStats = scoringConfig.format === "points"
              ? `FPts:${fmt(ps["FPts"] ?? 0, "FPts")}`
              : scoringConfig.cats.slice(0, 5).map((cat) => `${cat.id}:${fmtVal(ps[cat.id] ?? 0, cat)}`).join(" ");
            return `**${p.playerName}** (${p.position}): ${pStats}`;
          }).join(", ")}`
        : "";
      return `${t.name} | ${statsStr}${topPlayersStr}`;
    })
    .join("\n");

  const lines = [
    `Sport: ${sportName} | Format: ${scoringConfig.format}`,
    ``,
    `Strategy: ${strategyContext}`,
    ``,
    `My team (${myTeamName}) vs league average:`,
    avgDeltaLines.join("\n"),
    ``,
    `My key players (tradeable assets):`,
    formatRosterStats(myRoster, scoringConfig, 8),
    ``,
    `Other teams:`,
    otherTeams,
    ``,
    `Give exactly 3 numbered trade suggestions — a mix of "give" and "acquire" ideas (not complete packages). ` +
    `For a GIVE suggestion: "Consider trading away **[my player]** — their strength is [category] where I already lead the league, making them expendable. Seek back a player who helps my deficit in [weak category]." ` +
    `For an ACQUIRE suggestion: "Try to acquire **[player]** from **[team]** — they average [stat] which would move my [weak category] from [current value] closer to the league average of [avg value]." ` +
    `Reference specific stat numbers and league standing from the data above. Only name players from the rosters listed.`,
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
