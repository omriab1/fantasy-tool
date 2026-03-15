/**
 * test-matchup.mjs — regression tests for Matchup Planner logic
 * Run with: node test-matchup.mjs
 *
 * Covers:
 *   Suite 1  buildProjectionAccum — basic projection math
 *   Suite 2  buildCombinedAccum — merging actual + projected (future = empty actual)
 *   Suite 3  isCurrentPeriod logic — requestedPeriod vs matchupPeriodId (the fix)
 *   Suite 4  future matchup: Proj Score === Rest of Matchup when no actual stats
 *   Suite 5  current matchup: Proj Score > Rest of Matchup when actual stats exist
 *   Suite 6  past matchup detection via requestedPeriod (not matchupPeriodId)
 *   Suite 7  gamesRemaining === gamesInWeek for fully-future matchup weeks
 */

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}`);
    failed++;
  }
}

function assertClose(a, b, label, tol = 0.0001) {
  assert(Math.abs(a - b) < tol, `${label} (${a.toFixed(6)} ≈ ${b.toFixed(6)})`);
}

// ─── Inline implementations (mirrors lib/matchup-calculator.ts) ────────────

function buildGamesPerPlayer(players, gameMap) {
  const result = {};
  for (const p of players) {
    result[p.playerId] = gameMap[p.teamAbbrev] ?? 0;
  }
  return result;
}

function buildProjectionAccum(players, gamesPerPlayer) {
  const accum = {};
  for (const p of players) {
    const games = gamesPerPlayer[p.playerId] ?? 0;
    if (games === 0) continue;
    const gp = Math.max(p.gp, 1);
    const mult = games / gp;
    for (const [sidStr, val] of Object.entries(p.rawStats ?? {})) {
      const sid = parseInt(sidStr, 10);
      if (isNaN(sid)) continue;
      if (sid === 42 || sid === 30) continue; // skip GP stats
      accum[sid] = (accum[sid] ?? 0) + val * mult;
    }
  }
  return accum;
}

function buildCombinedAccum(actualScoreByStat, remainingAccum) {
  const combined = { ...remainingAccum };
  for (const [sidStr, score] of Object.entries(actualScoreByStat)) {
    const sid = parseInt(sidStr, 10);
    if (!isNaN(sid)) {
      combined[sid] = (combined[sid] ?? 0) + score;
    }
  }
  return combined;
}

/** Minimal scoringConfig with counting cats only (no percentages) */
const simpleCats = [
  { id: "PTS", compute: (acc) => acc[0] ?? 0 },
  { id: "REB", compute: (acc) => acc[6] ?? 0 },
  { id: "AST", compute: (acc) => acc[3] ?? 0 },
];
const simpleConfig = { format: "h2h_category", cats: simpleCats };

function accumToStats(accum, config) {
  if (config.format === "points") {
    let fpts = 0;
    for (const [sidStr, ptVal] of Object.entries(config.pointValues ?? {})) {
      const sid = parseInt(sidStr, 10);
      fpts += (accum[sid] ?? 0) * ptVal;
    }
    return { FPts: fpts };
  }
  const result = {};
  for (const cat of config.cats) {
    result[cat.id] = cat.compute(accum, 1);
  }
  return result;
}

/** Simulate the isCurrentPeriod logic from page.tsx (the fix) */
function getIsCurrentPeriod(requestedPeriod, currentMatchupPeriodId) {
  const effectivePeriod = requestedPeriod ?? currentMatchupPeriodId;
  return effectivePeriod === currentMatchupPeriodId;
}

/** Simulate the isPastMatchup logic from page.tsx (the fix) */
function getIsPastMatchup(requestedPeriod, matchupPeriodId, currentMatchupPeriodId) {
  const effectiveDisplayPeriod = requestedPeriod ?? matchupPeriodId ?? currentMatchupPeriodId;
  return effectiveDisplayPeriod < currentMatchupPeriodId;
}

// ─── Test data ────────────────────────────────────────────────────────────────

const playerA = {
  playerId: 1,
  teamAbbrev: "3", // LAL proTeamId
  gp: 10,
  rawStats: { "0": 200, "6": 80, "3": 50 }, // PTS=200, REB=80, AST=50 over 10 games
  injuryStatus: null,
};

const playerB = {
  playerId: 2,
  teamAbbrev: "13", // GSW proTeamId
  gp: 8,
  rawStats: { "0": 160, "6": 40, "3": 60 },
  injuryStatus: null,
};

const roster = [playerA, playerB];

// Game maps
const futureGameMap = { "3": 4, "13": 3 }; // future matchup: LAL plays 4, GSW plays 3
const remainingGameMap = { "3": 2, "13": 1 }; // current matchup mid-week remaining
const fullWeekGameMap = { "3": 4, "13": 3 };  // full week (current matchup)

// ─── Suite 1: buildProjectionAccum ───────────────────────────────────────────
console.log("\nSuite 1: buildProjectionAccum");

const gppFuture = buildGamesPerPlayer(roster, futureGameMap);
const futureAccum = buildProjectionAccum(roster, gppFuture);

// playerA: PTS = 200/10 * 4 = 80, REB = 80/10 * 4 = 32, AST = 50/10 * 4 = 20
// playerB: PTS = 160/8 * 3 = 60, REB = 40/8 * 3 = 15, AST = 60/8 * 3 = 22.5
assertClose(futureAccum[0], 140, "PTS accumulator: 80+60=140");
assertClose(futureAccum[6], 47, "REB accumulator: 32+15=47");
assertClose(futureAccum[3], 42.5, "AST accumulator: 20+22.5=42.5");

const gppRem = buildGamesPerPlayer(roster, remainingGameMap);
const remAccum = buildProjectionAccum(roster, gppRem);
// playerA: PTS = 200/10*2 = 40; playerB: PTS = 160/8*1 = 20
assertClose(remAccum[0], 60, "Remaining PTS: 40+20=60");

// OUT player gets 0 games
const gppWithOut = { ...gppFuture };
gppWithOut[playerA.playerId] = 0;
const outAccum = buildProjectionAccum(roster, gppWithOut);
// Only playerB contributes
assertClose(outAccum[0], 60, "OUT player excluded: only playerB's PTS=60");

// ─── Suite 2: buildCombinedAccum ─────────────────────────────────────────────
console.log("\nSuite 2: buildCombinedAccum");

// Empty actual (future matchup) — combined should equal remaining
const combinedFuture = buildCombinedAccum({}, remAccum);
assertClose(combinedFuture[0], remAccum[0], "Empty actual + remaining = remaining (PTS)");
assertClose(combinedFuture[6] ?? 0, remAccum[6] ?? 0, "Empty actual + remaining = remaining (REB)");

// With actual stats (current matchup)
const actualStats = { "0": 50, "6": 20, "3": 15 }; // stats accumulated so far this week
const combinedCurrent = buildCombinedAccum(actualStats, remAccum);
assertClose(combinedCurrent[0], 50 + remAccum[0], "Actual + remaining PTS combined correctly");
assertClose(combinedCurrent[6], 20 + (remAccum[6] ?? 0), "Actual + remaining REB combined correctly");

// Non-numeric keys are ignored
const combinedWithJunk = buildCombinedAccum({ "abc": 999, "0": 10 }, remAccum);
assertClose(combinedWithJunk[0], 10 + remAccum[0], "Non-numeric keys in actual are ignored");

// ─── Suite 3: isCurrentPeriod logic (the fix) ─────────────────────────────────
console.log("\nSuite 3: isCurrentPeriod — requestedPeriod vs matchupPeriodId");

const CURRENT = 19;

// Case 1: requestedPeriod=null (default — viewing current), matchupPeriodId=19
assert(getIsCurrentPeriod(null, CURRENT) === true, "null requestedPeriod → isCurrentPeriod=true");

// Case 2: requestedPeriod=19 (explicitly current)
assert(getIsCurrentPeriod(19, CURRENT) === true, "requestedPeriod=currentPeriod → isCurrentPeriod=true");

// Case 3: requestedPeriod=20 (future), even if API falls back and returns matchupPeriodId=19
assert(getIsCurrentPeriod(20, CURRENT) === false, "requestedPeriod=future → isCurrentPeriod=false (THE FIX)");

// Case 4: requestedPeriod=21 (2 weeks ahead)
assert(getIsCurrentPeriod(21, CURRENT) === false, "requestedPeriod=2 weeks ahead → isCurrentPeriod=false");

// Case 5: requestedPeriod=18 (past)
assert(getIsCurrentPeriod(18, CURRENT) === false, "requestedPeriod=past → isCurrentPeriod=false");

// OLD (broken) logic: uses matchupPeriodId from API which falls back to current period for future
function getIsCurrentPeriodOLD(matchupPeriodId, currentMatchupPeriodId) {
  return matchupPeriodId === currentMatchupPeriodId;
}
// Simulate: user requests period 20, API fallback returns matchupPeriodId=19 (the bug)
assert(
  getIsCurrentPeriodOLD(19, CURRENT) === true,
  "OLD logic: API fallback period 19 → isCurrentPeriod=true (this was the bug)"
);
assert(
  getIsCurrentPeriod(20, CURRENT) === false,
  "NEW logic: requestedPeriod=20 → isCurrentPeriod=false despite API fallback (fix confirmed)"
);

// ─── Suite 4: future matchup — Proj Score === Rest of Matchup ─────────────────
console.log("\nSuite 4: future matchup — Proj Score must equal Rest of Matchup");

// Simulate future matchup: requestedPeriod=20, currentMatchupPeriodId=19
// Even if API falls back: matchupPeriodId=19 (bug scenario), teamCurrentStats has real data
const teamCurrentStatsWithData = {
  1001: { "0": 120, "6": 45, "3": 30 }, // my team's real current week stats
};

const myTeamId = 1001;
const futureRequestedPeriod = 20;

// NEW logic (fix)
const isCurrentNew = getIsCurrentPeriod(futureRequestedPeriod, CURRENT); // false ✓
const actualNew = isCurrentNew ? (teamCurrentStatsWithData[myTeamId] ?? {}) : {};

const futureGpp = buildGamesPerPlayer(roster, futureGameMap);
const futureRem = buildProjectionAccum(roster, futureGpp);
const projScoreNew = accumToStats(buildCombinedAccum(actualNew, futureRem), simpleConfig);
const restOfMatchupNew = accumToStats(buildProjectionAccum(roster, futureGpp), simpleConfig);

assertClose(projScoreNew.PTS, restOfMatchupNew.PTS, "Future: Proj Score PTS === Rest of Matchup PTS");
assertClose(projScoreNew.REB, restOfMatchupNew.REB, "Future: Proj Score REB === Rest of Matchup REB");
assertClose(projScoreNew.AST, restOfMatchupNew.AST, "Future: Proj Score AST === Rest of Matchup AST");

// OLD logic (bug reproduction)
const isCurrentOld = getIsCurrentPeriodOLD(CURRENT, CURRENT); // true (wrong for future!)
const actualOld = isCurrentOld ? (teamCurrentStatsWithData[myTeamId] ?? {}) : {};
const projScoreOld = accumToStats(buildCombinedAccum(actualOld, futureRem), simpleConfig);

assert(
  Math.abs(projScoreOld.PTS - restOfMatchupNew.PTS) > 0.001,
  `Bug reproduced: OLD Proj Score PTS (${projScoreOld.PTS}) ≠ Rest of Matchup PTS (${restOfMatchupNew.PTS})`
);
assert(
  Math.abs(projScoreNew.PTS - restOfMatchupNew.PTS) < 0.001,
  `Fix confirmed: NEW Proj Score PTS (${projScoreNew.PTS.toFixed(2)}) === Rest of Matchup PTS (${restOfMatchupNew.PTS.toFixed(2)})`
);

// ─── Suite 5: current matchup — Proj Score > Rest of Matchup (correct behavior) ──
console.log("\nSuite 5: current matchup — Proj Score should include actual stats");

const currentRequestedPeriod = null; // null = current

const isCurrentMatchup = getIsCurrentPeriod(currentRequestedPeriod, CURRENT);
const actualCurrentStats = isCurrentMatchup ? (teamCurrentStatsWithData[myTeamId] ?? {}) : {};

const currentGpp = buildGamesPerPlayer(roster, remainingGameMap);
const currentRem = buildProjectionAccum(roster, currentGpp);
const projScoreCurrent = accumToStats(buildCombinedAccum(actualCurrentStats, currentRem), simpleConfig);
const restOfMatchupCurrent = accumToStats(buildProjectionAccum(roster, currentGpp), simpleConfig);

assert(
  projScoreCurrent.PTS > restOfMatchupCurrent.PTS,
  `Current: Proj Score PTS (${projScoreCurrent.PTS.toFixed(2)}) > Rest of Matchup PTS (${restOfMatchupCurrent.PTS.toFixed(2)}) — actual stats included`
);
assertClose(
  projScoreCurrent.PTS,
  restOfMatchupCurrent.PTS + 120, // actual 120 PTS added
  "Current: Proj Score = actual PTS + remaining projection"
);

// ─── Suite 6: isPastMatchup via requestedPeriod ────────────────────────────────
console.log("\nSuite 6: isPastMatchup — requestedPeriod takes priority");

// Past matchup requested (period 18), API returns correct period 18
assert(getIsPastMatchup(18, 18, CURRENT) === true, "requestedPeriod=18 < current=19 → isPastMatchup=true");

// Future matchup (period 20), API falls back to period 19 (the bug scenario)
assert(
  getIsPastMatchup(20, 19, CURRENT) === false,
  "requestedPeriod=20 > current=19 → isPastMatchup=false (even if API returned 19)"
);

// Current matchup (null requestedPeriod), matchupPeriodId=19
assert(getIsPastMatchup(null, 19, CURRENT) === false, "null requestedPeriod → isPastMatchup=false");

// Past matchup (null requestedPeriod would be current, not past — edge case)
assert(getIsPastMatchup(null, 19, CURRENT) === false, "null requestedPeriod defaults to current → not past");

// ─── Suite 7: gamesRemaining === gamesInWeek for future week ─────────────────
console.log("\nSuite 7: gamesRemaining = gamesInWeek for a fully-future matchup week");

// Simulate the API's game count logic for a future week
function computeGameCounts(weekDates, today, scheduleByDate) {
  const gamesInWeek = {};
  const gamesRemaining = {};
  const teams = ["LAL", "GSW", "BOS", "MIA"];
  for (const t of teams) { gamesInWeek[t] = 0; gamesRemaining[t] = 0; }

  for (const date of weekDates) {
    const playing = scheduleByDate[date] ?? [];
    const isFuture = date >= today;
    for (const team of playing) {
      gamesInWeek[team] = (gamesInWeek[team] ?? 0) + 1;
      if (isFuture) gamesRemaining[team] = (gamesRemaining[team] ?? 0) + 1;
    }
  }
  return { gamesInWeek, gamesRemaining };
}

// Future week: all 7 days are after today
const today = "2026-03-15";
const nextWeek = ["2026-03-16","2026-03-17","2026-03-18","2026-03-19","2026-03-20","2026-03-21","2026-03-22"];
const futureSchedule = {
  "2026-03-17": ["LAL", "GSW"],
  "2026-03-19": ["LAL", "BOS"],
  "2026-03-21": ["GSW", "MIA"],
  "2026-03-22": ["BOS", "MIA"],
};
const { gamesInWeek: giw, gamesRemaining: gr } = computeGameCounts(nextWeek, today, futureSchedule);

assert(giw["LAL"] === gr["LAL"], `Future week: gamesInWeek["LAL"](${giw["LAL"]}) === gamesRemaining["LAL"](${gr["LAL"]})`);
assert(giw["GSW"] === gr["GSW"], `Future week: gamesInWeek["GSW"](${giw["GSW"]}) === gamesRemaining["GSW"](${gr["GSW"]})`);
assert(giw["BOS"] === gr["BOS"], `Future week: gamesInWeek["BOS"](${giw["BOS"]}) === gamesRemaining["BOS"](${gr["BOS"]})`);

// Current week mid-week: some games are past
const thisWeek = ["2026-03-10","2026-03-11","2026-03-12","2026-03-13","2026-03-14","2026-03-15","2026-03-16"];
const thisSchedule = {
  "2026-03-10": ["LAL", "GSW"], // past
  "2026-03-12": ["LAL", "BOS"], // past
  "2026-03-15": ["GSW", "MIA"], // today = counts as remaining
  "2026-03-16": ["BOS", "MIA"], // future
};
const { gamesInWeek: giwCur, gamesRemaining: grCur } = computeGameCounts(thisWeek, today, thisSchedule);

assert(giwCur["LAL"] === 2 && grCur["LAL"] === 0, `Current week: LAL played 2, remaining=0`);
assert(giwCur["GSW"] === 2 && grCur["GSW"] === 1, `Current week: GSW total=2, remaining=1 (today)`);
assert(
  giwCur["BOS"] !== grCur["BOS"],
  `Current week: gamesInWeek["BOS"](${giwCur["BOS"]}) ≠ gamesRemaining["BOS"](${grCur["BOS"]}) as expected`
);

// ─── Summary ────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log("  All matchup tests passed ✓");
} else {
  console.error("  FAILURES detected — review before pushing!");
  process.exit(1);
}
