/**
 * test-power.mjs  —  regression tests for all Power Rankings changes
 * Run with:  node test-power.mjs
 *
 * Covers:
 *   Suites 1-5   original round-robin / ranking / win% logic
 *   Suite 6      calcTradeScore sub-precision tiebreaker (AFG% / FT%)
 *   Suite 7      delta display strings  "> +.001" / "< -.001"
 *   Suite 8      fmt() edge cases relevant to the display
 *   Suite 9      row-collapse logic (any-row click always clears expansion)
 *   Suite 10     fmt() with endsWith("%) — any percentage category works
 *   Suite 11     calcTradeScore with dynamic config (points / custom cats)
 *   Suite 12     aggregateStats — perGameRounded volume display fix
 *   Suite 13     parseLeagueScoringConfig — categories / points / roto / fallbacks
 *   Suite 14     scoringConfigLabel — human-readable config summary
 *   Suite 15     volume category name extraction (trade page note logic)
 *   Suite 16     NHL stat map — compute functions, lowerIsBetter flags
 *   Suite 17     aggregateStats — hockey GP (stat 30) accumulates as raw total
 *   Suite 18     parseLeagueScoringConfig with NHL sport cfg (sport-specific stat map)
 *   Suite 19     Hockey position building — active slot filtering + F-suppression rule
 */

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  FAIL: ${label}`);
    failed++;
  }
}

// ─── Replicated from lib/trade-score.ts (including sub-precision fix) ─────────

const CATEGORIES = ["AFG%", "FT%", "3PM", "REB", "AST", "STL", "BLK", "TO", "PTS"];
const LOWER_IS_BETTER = ["TO"];

function calcTradeScore(giving, receiving) {
  const results = CATEGORIES.map((cat) => {
    const g = giving[cat];
    const r = receiving[cat];
    const isPct = cat === "AFG%" || cat === "FT%";
    const factor = isPct ? 10000 : 10;
    const rg = Math.round(g * factor) / factor;
    const rr = Math.round(r * factor) / factor;
    const delta = Math.round((rr - rg) * factor) / factor;
    const lowerIsBetter = LOWER_IS_BETTER.includes(cat);

    let winner;
    if (delta === 0) {
      if (isPct) {
        // Sub-precision fix: raw-value tiebreaker when display rounds to same value
        const rawDiff = r - g;
        if (rawDiff === 0)       winner = "push";
        else if (lowerIsBetter)  winner = rawDiff < 0 ? "receiving" : "giving";
        else                     winner = rawDiff > 0 ? "receiving" : "giving";
      } else {
        winner = "push";
      }
    } else if (lowerIsBetter) {
      winner = delta < 0 ? "receiving" : "giving";
    } else {
      winner = delta > 0 ? "receiving" : "giving";
    }

    return { category: cat, giving: rg, receiving: rr, delta, winner };
  });

  return {
    results,
    winsForReceiving: results.filter((r) => r.winner === "receiving").length,
    losses:           results.filter((r) => r.winner === "giving").length,
    equals:           results.filter((r) => r.winner === "push").length,
    totalCats: CATEGORIES.length,
  };
}

// ─── Replicated from lib/stat-calculator.ts ───────────────────────────────────

function fmt(val, cat) {
  if (cat === "AFG%" || cat === "FT%") {
    const sign = val < 0 ? "-" : "";
    const abs = Math.abs(val).toFixed(3);
    return sign + abs.slice(1);   // ".550", "-.001", etc.
  }
  return val.toFixed(1);
}

// ─── Replicated round-robin + ranking from app/power/page.tsx ─────────────────

function initAccum() {
  return { pts:0, reb:0, ast:0, stl:0, blk:0, to:0, threepm:0, fgm:0, fga:0, ftm:0, fta:0, weeks:0 };
}

function accumToStats(acc) {
  const w = Math.max(acc.weeks, 1);
  return {
    PTS: acc.pts/w, REB: acc.reb/w, AST: acc.ast/w, STL: acc.stl/w, BLK: acc.blk/w,
    TO: acc.to/w, "3PM": acc.threepm/w,
    "AFG%": acc.fga > 0 ? (acc.fgm + 0.5*acc.threepm)/acc.fga : 0,
    "FT%":  acc.fta > 0 ? acc.ftm/acc.fta : 0,
  };
}

function runRoundRobin(teams, statsMap) {
  const entriesMap = new Map();
  for (const team of teams) {
    entriesMap.set(team.id, { teamId:team.id, teamName:team.name, wins:0, losses:0, ties:0, winPct:0, matchups:[] });
  }
  for (let i = 0; i < teams.length; i++) {
    for (let j = i+1; j < teams.length; j++) {
      const teamA = teams[i], teamB = teams[j];
      const result = calcTradeScore(statsMap[teamA.id], statsMap[teamB.id]);
      const aCatWins = result.losses, bCatWins = result.winsForReceiving, pushes = result.equals;
      const entryA = entriesMap.get(teamA.id), entryB = entriesMap.get(teamB.id);
      let aResult, bResult;
      if (aCatWins > bCatWins)       { aResult="W"; bResult="L"; entryA.wins++;   entryB.losses++; }
      else if (bCatWins > aCatWins)  { aResult="L"; bResult="W"; entryB.wins++;   entryA.losses++; }
      else                           { aResult="T"; bResult="T"; entryA.ties++;   entryB.ties++;   }
      entryA.matchups.push({ opponentId:teamB.id, teamCatWins:aCatWins, oppCatWins:bCatWins, pushes, result:aResult });
      entryB.matchups.push({ opponentId:teamA.id, teamCatWins:bCatWins, oppCatWins:aCatWins, pushes, result:bResult });
    }
  }
  const entries = Array.from(entriesMap.values());
  for (const e of entries) {
    const total = e.wins + e.losses + e.ties;
    e.winPct = total > 0 ? ((e.wins + 0.5*e.ties)/total)*100 : 0;
  }
  return entries;
}

function rankEntries(entries) {
  entries.sort((a, b) => {
    if (b.wins !== a.wins)     return b.wins - a.wins;
    if (a.losses !== b.losses) return a.losses - b.losses;
    return b.winPct - a.winPct;
  });
  const ranked = [];
  let idx = 0;
  while (idx < entries.length) {
    let jdx = idx+1;
    while (jdx < entries.length &&
           entries[jdx].wins   === entries[idx].wins &&
           entries[jdx].losses === entries[idx].losses &&
           entries[jdx].ties   === entries[idx].ties) jdx++;
    const group = entries.slice(idx, jdx);
    const rank  = idx + 1;
    if (group.length > 1) {
      group.sort((a, b) => {
        const m = a.matchups.find((mu) => mu.opponentId === b.teamId);
        if (m?.result === "W") return -1;
        if (m?.result === "L") return 1;
        return 0;
      });
    }
    for (const e of group) ranked.push({ ...e, rank });
    idx = jdx;
  }
  return ranked;
}

// ─── Delta display logic (replicated from MatchupTooltip + CategoryTable) ─────

function computeDeltaDisplay(r) {
  const teamWins = r.winner === "giving";
  const oppWins  = r.winner === "receiving";
  const subPrecision = r.winner !== "push" && fmt(r.giving, r.category) === fmt(r.receiving, r.category);
  const absDelta  = Math.abs(r.delta);
  const deltaSign = teamWins ? "+" : oppWins ? "-" : "";
  if (r.winner === "push")  return "";
  if (subPrecision)         return teamWins ? "> +.001" : "< -.001";
  return `${deltaSign}${fmt(absDelta, r.category)}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const baseStats = { PTS:100, REB:40, AST:25, STL:8, BLK:4, TO:14, "3PM":10, "AFG%":0.50, "FT%":0.78 };
function statsWith(overrides) { return { ...baseStats, ...overrides }; }

function totalW(e) { return e.reduce((s,x) => s+x.wins, 0); }
function totalL(e) { return e.reduce((s,x) => s+x.losses, 0); }
function totalT(e) { return e.reduce((s,x) => s+x.ties, 0); }

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 1 — Clear 4-team ordering  (A > B > C > D in every category)
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n─── Suite 1: Clear 4-team ordering (A > B > C > D) ───");
{
  const teams = [{id:1,name:"A"},{id:2,name:"B"},{id:3,name:"C"},{id:4,name:"D"}];
  const sm = {
    1: { PTS:120,REB:50,AST:30,STL:10,BLK:5,TO:12,"3PM":15,"AFG%":0.55,"FT%":0.85 },
    2: { PTS:110,REB:45,AST:25,STL:8, BLK:4,TO:14,"3PM":12,"AFG%":0.52,"FT%":0.80 },
    3: { PTS:100,REB:40,AST:20,STL:6, BLK:3,TO:16,"3PM":9, "AFG%":0.49,"FT%":0.75 },
    4: { PTS:90, REB:35,AST:15,STL:4, BLK:2,TO:18,"3PM":6, "AFG%":0.46,"FT%":0.70 },
  };
  const entries = runRoundRobin(teams, sm);
  const ranked  = rankEntries([...entries]);
  const N = teams.length;
  const byId = Object.fromEntries(ranked.map((e) => [e.teamId, e]));

  assert(totalW(entries) === totalL(entries), "total W == total L");
  assert(totalT(entries) % 2 === 0,           "total T is even");
  assert(entries.every((e) => e.wins+e.losses+e.ties === N-1), `each team plays ${N-1} games`);
  assert(totalW(entries) === N*(N-1)/2,        `total W = N*(N-1)/2 = ${N*(N-1)/2}`);
  assert(byId[1].wins===3 && byId[1].losses===0, "A: 3W 0L");
  assert(byId[2].wins===2 && byId[2].losses===1, "B: 2W 1L");
  assert(byId[3].wins===1 && byId[3].losses===2, "C: 1W 2L");
  assert(byId[4].wins===0 && byId[4].losses===3, "D: 0W 3L");
  assert(byId[1].rank===1, "A ranked #1");
  assert(byId[2].rank===2, "B ranked #2");
  assert(byId[3].rank===3, "C ranked #3");
  assert(byId[4].rank===4, "D ranked #4");
  assert(Math.abs(byId[1].winPct-100.0)<0.01, "A winPct=100%");
  assert(Math.abs(byId[2].winPct-66.67)<0.01, "B winPct≈66.7%");
  assert(Math.abs(byId[3].winPct-33.33)<0.01, "C winPct≈33.3%");
  assert(Math.abs(byId[4].winPct-0.0  )<0.01, "D winPct=0%");
  for (const m of byId[1].matchups) {
    assert(m.teamCatWins+m.oppCatWins+m.pushes===9, `cat scores sum to 9 (A vs ${m.opponentId})`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 2 — All identical stats → all ties
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n─── Suite 2: All identical stats → all ties ───");
{
  const teams = [{id:1,name:"Alpha"},{id:2,name:"Beta"},{id:3,name:"Gamma"},{id:4,name:"Delta"}];
  const sm = {1:baseStats,2:baseStats,3:baseStats,4:baseStats};
  const entries = runRoundRobin(teams, sm);
  const N = teams.length;
  assert(totalW(entries)===0,                              "no wins");
  assert(totalT(entries)===N*(N-1),                        `T = N*(N-1) = ${N*(N-1)}`);
  assert(entries.every((e)=>e.wins===0&&e.losses===0&&e.ties===N-1), "every team 0W 0L 3T");
  assert(entries.every((e)=>Math.abs(e.winPct-50.0)<0.01), "all winPct=50%");
  assert(entries.flatMap((e)=>e.matchups).every((m)=>m.result==="T"), "all matchup results T");
  assert(rankEntries([...entries]).every((e)=>e.rank===1), "all rank #1");
}

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 3 — 2-way rank tie + head-to-head ordering + rank skip
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n─── Suite 3: 2-way rank tie + head-to-head + rank skip ───");
{
  const entries = [
    {teamId:1,teamName:"A",wins:3,losses:0,ties:0,winPct:100.0,matchups:[{opponentId:2,result:"W"},{opponentId:3,result:"W"},{opponentId:4,result:"W"}]},
    {teamId:2,teamName:"B",wins:2,losses:1,ties:0,winPct:66.67,matchups:[{opponentId:1,result:"L"},{opponentId:3,result:"W"},{opponentId:4,result:"W"}]},
    {teamId:3,teamName:"C",wins:2,losses:1,ties:0,winPct:66.67,matchups:[{opponentId:1,result:"L"},{opponentId:2,result:"L"},{opponentId:4,result:"W"}]},
    {teamId:4,teamName:"D",wins:0,losses:3,ties:0,winPct:0.0,  matchups:[{opponentId:1,result:"L"},{opponentId:2,result:"L"},{opponentId:3,result:"L"}]},
  ];
  const ranked = rankEntries([...entries]);
  const byId = Object.fromEntries(ranked.map((e)=>[e.teamId,e]));
  assert(byId[1].rank===1, "A is rank #1 (unique, 3-0)");
  assert(byId[2].rank===2, "B is rank #2 (tied, H2H winner over C)");
  assert(byId[3].rank===2, "C is rank #2 (tied with B)");
  assert(byId[4].rank===4, "D is rank #4 (skips #3 because 2 teams share #2)");
  const tiedGroup = ranked.filter((e)=>e.rank===2);
  assert(tiedGroup[0].teamId===2, "B (H2H winner) listed first in tied group");
  assert(tiedGroup[1].teamId===3, "C listed second");
}

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 4 — T breakdown filtering
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n─── Suite 4: T breakdown filtering ───");
{
  const teams = [{id:1,name:"X"},{id:2,name:"Y"}];
  const sm = {1:baseStats,2:baseStats};
  const entries = runRoundRobin(teams, sm);
  const byId = Object.fromEntries(entries.map((e)=>[e.teamId,e]));
  assert(byId[1].ties===1, "X has 1 tie");
  assert(byId[2].ties===1, "Y has 1 tie");
  assert(byId[1].matchups[0].result==="T", "X matchup result is T");
  const tBreak = byId[1].matchups.filter((m)=>m.result==="T");
  const wBreak = byId[1].matchups.filter((m)=>m.result==="W");
  const lBreak = byId[1].matchups.filter((m)=>m.result==="L");
  assert(tBreak.length===1, "T-breakdown has 1 entry");
  assert(wBreak.length===0, "W-breakdown is empty");
  assert(lBreak.length===0, "L-breakdown is empty");
  const m = tBreak[0];
  assert(m.teamCatWins+m.oppCatWins+m.pushes===9, "tie cat score sums to 9");
  assert(m.teamCatWins===m.oppCatWins, "cat wins equal on both sides");
}

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 5 — Win% formula edge cases
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n─── Suite 5: Win% formula ───");
{
  const pct = (W,L,T) => { const tot=W+L+T; return tot>0?((W+0.5*T)/tot)*100:0; };
  assert(Math.abs(pct(9,0,0)-100.0)<0.01, "9-0-0 → 100.0%");
  assert(Math.abs(pct(0,9,0)-0.0  )<0.01, "0-9-0 → 0.0%");
  assert(Math.abs(pct(0,0,9)-50.0 )<0.01, "0-0-9 → 50.0%");
  assert(Math.abs(pct(6,3,0)-66.67)<0.01, "6-3-0 → 66.7%");
  assert(Math.abs(pct(5,3,1)-61.11)<0.01, "5-3-1 → 61.1%");
  assert(pct(0,0,0)===0,                  "0-0-0 → 0 (no divide-by-zero)");
}

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 6 — calcTradeScore sub-precision tiebreaker (AFG% / FT%)
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n─── Suite 6: calcTradeScore sub-precision tiebreaker ───");
{
  // Helper: build full stats with just AFG% or FT% overridden, everything else equal
  const s = (afg, ft) => ({ ...baseStats, "AFG%": afg, "FT%": ft });

  // 6a — AFG% differs at the 4th decimal place; both display as .550
  //      giving=0.5503, receiving=0.5497  →  delta=-0.0006 at factor 10000  →  giving wins
  {
    const result = calcTradeScore(s(0.5503, 0.78), s(0.5497, 0.78));
    const afg = result.results.find((r) => r.category === "AFG%");
    assert(afg.winner === "giving",  "AFG% 4th-decimal: giving (.5503) beats receiving (.5497)");
    assert(fmt(afg.giving,   "AFG%") === ".550", "AFG% giving displays as .550");
    assert(fmt(afg.receiving,"AFG%") === ".550", "AFG% receiving also displays as .550");
    assert(afg.delta !== 0,          "delta is non-zero at 4th decimal");
  }

  // 6b — AFG% differs only at the 5th+ decimal (new raw-comparison fix)
  //      giving=0.55004, receiving=0.54996  →  both round to 0.5500 at factor 10000
  //      old code → push;  new code → giving wins
  {
    const result = calcTradeScore(s(0.55004, 0.78), s(0.54996, 0.78));
    const afg = result.results.find((r) => r.category === "AFG%");
    assert(afg.winner === "giving",   "AFG% 5th-decimal raw fix: giving (.55004) beats receiving (.54996)");
    assert(afg.delta === 0,           "delta still shows 0 at display precision");
    assert(fmt(afg.giving,   "AFG%") === ".550", "giving still displays .550");
    assert(fmt(afg.receiving,"AFG%") === ".550", "receiving still displays .550");
  }

  // 6c — AFG% genuinely equal at raw level → push
  {
    const result = calcTradeScore(s(0.5500, 0.78), s(0.5500, 0.78));
    const afg = result.results.find((r) => r.category === "AFG%");
    assert(afg.winner === "push", "AFG% exact equality → push");
  }

  // 6d — FT% sub-precision (same logic applies to both pct categories)
  //      giving=0.8003, receiving=0.7997  →  both display .800, giving wins
  {
    const result = calcTradeScore(s(0.50, 0.8003), s(0.50, 0.7997));
    const ft = result.results.find((r) => r.category === "FT%");
    assert(ft.winner === "giving",    "FT% 4th-decimal: giving (.8003) beats receiving (.7997)");
    assert(fmt(ft.giving,   "FT%") === ".800", "FT% giving displays as .800");
    assert(fmt(ft.receiving,"FT%") === ".800", "FT% receiving displays as .800");
  }

  // 6e — Non-pct category (PTS) that rounds to same display value → genuine push (no raw fix)
  //      giving=120.04, receiving=119.96  →  both round to 120.0 at factor 10  →  push
  {
    const result = calcTradeScore(
      { ...baseStats, "AFG%":0.50, "FT%":0.78, PTS:120.04 },
      { ...baseStats, "AFG%":0.50, "FT%":0.78, PTS:119.96 }
    );
    const pts = result.results.find((r) => r.category === "PTS");
    assert(pts.winner === "push",     "PTS sub-decimal-precision stays a push (non-pct)");
  }

  // 6f — receiving wins AFG% sub-precision
  {
    const result = calcTradeScore(s(0.54996, 0.78), s(0.55004, 0.78));
    const afg = result.results.find((r) => r.category === "AFG%");
    assert(afg.winner === "receiving", "AFG% raw fix correctly picks receiving as winner");
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 7 — Delta display strings: "> +.001" / "< -.001" / normal
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n─── Suite 7: Delta display strings ───");
{
  // Helper: build a fake CategoryResult for display testing
  const makeResult = (cat, giving, receiving, winner, delta=0) =>
    ({ category:cat, giving, receiving, winner, delta });

  // 7a — Sub-precision win (display equal, but winner=giving) → "> +.001"
  {
    const r = makeResult("AFG%", 0.5503, 0.5497, "giving", -0.0006);
    // Note: fmt(0.5503,"AFG%") = ".550" = fmt(0.5497,"AFG%")  →  subPrecision = true
    assert(computeDeltaDisplay(r) === "> +.001",
      'sub-precision giving win → "> +.001"');
  }

  // 7b — Sub-precision loss (display equal, winner=receiving) → "< -.001"
  {
    const r = makeResult("AFG%", 0.5497, 0.5503, "receiving", 0.0006);
    assert(computeDeltaDisplay(r) === "< -.001",
      'sub-precision receiving win → "< -.001"');
  }

  // 7c — Sub-precision at 5th decimal (delta=0 stored, winner determined by raw)
  {
    const r = makeResult("AFG%", 0.5500, 0.5500, "giving", 0);
    // fmt(0.5500) = ".550" = fmt(0.5500), winner != push → subPrecision
    assert(computeDeltaDisplay(r) === "> +.001",
      '5th-decimal sub-precision giving → "> +.001"');
  }

  // 7d — Normal win (values clearly differ) → "+X.X" for count stats
  {
    const r = makeResult("PTS", 120.0, 110.0, "giving", -10.0);
    assert(computeDeltaDisplay(r) === "+10.0", 'normal giving win PTS → "+10.0"');
  }

  // 7e — Normal loss → "-X.X"
  {
    const r = makeResult("PTS", 110.0, 120.0, "receiving", 10.0);
    assert(computeDeltaDisplay(r) === "-10.0", 'normal receiving win PTS → "-10.0"');
  }

  // 7f — Push → ""
  {
    const r = makeResult("PTS", 110.0, 110.0, "push", 0);
    assert(computeDeltaDisplay(r) === "", 'push → ""');
  }

  // 7g — Verify NO old broken pattern appears
  {
    const rWin  = makeResult("AFG%", 0.5503, 0.5497, "giving", -0.0006);
    const rLoss = makeResult("AFG%", 0.5497, 0.5503, "receiving", 0.0006);
    assert(!computeDeltaDisplay(rWin).startsWith("-<"),  'win display never starts with "-<"');
    assert(!computeDeltaDisplay(rWin).startsWith("+<"),  'win display never starts with "+<"');
    assert(!computeDeltaDisplay(rLoss).startsWith("-<"), 'loss display never starts with "-<"');
    assert(!computeDeltaDisplay(rLoss).includes("<+"),   'loss display never contains "<+"');
  }

  // 7h — FT% sub-precision win → "> +.001"
  {
    const r = makeResult("FT%", 0.8003, 0.7997, "giving", -0.0006);
    assert(computeDeltaDisplay(r) === "> +.001", 'FT% sub-precision giving → "> +.001"');
  }

  // 7i — Normal pct win with visible difference → "+.003" style
  {
    const r = makeResult("AFG%", 0.553, 0.550, "giving", -0.003);
    // fmt(0.553) = ".553", fmt(0.550) = ".550" → different → not subPrecision
    assert(computeDeltaDisplay(r) === "+.003", 'normal AFG% win → "+.003"');
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 8 — fmt() edge cases
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n─── Suite 8: fmt() edge cases ───");
{
  // Percentages shown as .xxx
  assert(fmt(0.550,  "AFG%") === ".550", "AFG% 0.550 → .550");
  assert(fmt(0.5503, "AFG%") === ".550", "AFG% 0.5503 → .550 (rounds at 3 decimal)");
  assert(fmt(0.5497, "AFG%") === ".550", "AFG% 0.5497 → .550 (rounds at 3 decimal)");
  assert(fmt(0.465,  "AFG%") === ".465", "AFG% 0.465 → .465");
  assert(fmt(0.800,  "FT%")  === ".800", "FT% 0.800 → .800");
  assert(fmt(0,      "AFG%") === ".000", "AFG% 0 → .000");
  // Negative (delta display)
  assert(fmt(-0.001, "AFG%") === "-.001","AFG% -0.001 → -.001");
  assert(fmt(-0.0006,"AFG%") === "-.001","AFG% -0.0006 rounds to -.001");
  assert(fmt(0.0006, "AFG%") === ".001", "AFG% 0.0006 rounds to .001");
  // Count stats shown as X.X
  assert(fmt(110.0,  "PTS")  === "110.0","PTS 110 → 110.0");
  assert(fmt(110.5,  "PTS")  === "110.5","PTS 110.5 → 110.5");
  assert(fmt(0,      "PTS")  === "0.0",  "PTS 0 → 0.0");
  assert(fmt(-3.0,   "TO")   === "-3.0", "TO delta -3.0 → -3.0");
}

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 9 — Row-collapse logic
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n─── Suite 9: Row-collapse logic ───");
{
  // Simulate the expandedTeamId / expandedType state machine.
  // The new rule: any row click always clears state (not just the expanded team's row).
  let expandedTeamId = null;
  let expandedType   = null;

  function handleExpandToggle(teamId, type) {
    if (expandedTeamId === teamId && expandedType === type) {
      expandedTeamId = null; expandedType = null;  // same button → collapse
    } else {
      expandedTeamId = teamId; expandedType = type; // different button → open
    }
  }

  // Simulates clicking the row background (always clears)
  function handleRowClick() {
    expandedTeamId = null;
    expandedType   = null;
  }

  // Open W for team 1
  handleExpandToggle(1, "W");
  assert(expandedTeamId === 1 && expandedType === "W", "opening W for team 1 sets state");

  // Click row of team 2 → should close regardless
  handleRowClick();   // row click always clears
  assert(expandedTeamId === null && expandedType === null, "clicking any row closes breakdown");

  // Open L for team 3
  handleExpandToggle(3, "L");
  assert(expandedTeamId === 3 && expandedType === "L", "opening L for team 3");

  // Click same L button → collapses
  handleExpandToggle(3, "L");
  assert(expandedTeamId === null && expandedType === null, "same L button collapses");

  // Open W for team 2, then click T for team 2 → switches (stopPropagation prevents row-close)
  handleExpandToggle(2, "W");
  handleExpandToggle(2, "T");
  assert(expandedTeamId === 2 && expandedType === "T", "switching from W to T on same team works");

  // Now click row → closes
  handleRowClick();
  assert(expandedTeamId === null, "row click after switch also closes");

  // Open W for team 1, then click row of team 1 → should also close (own row)
  handleExpandToggle(1, "W");
  handleRowClick();
  assert(expandedTeamId === null, "clicking expanded team's own row closes too");
}

// ══════════════════════════════════════════════════════════════════════════════
//  NEW HELPERS — replicated from dynamic-scoring lib files
// ══════════════════════════════════════════════════════════════════════════════

// ── Replicated from lib/stat-calculator.ts (new: uses endsWith("%")) ──────────
function fmtNew(val, cat) {
  if (cat.endsWith("%")) {
    const sign = val < 0 ? "-" : "";
    const abs = Math.abs(val).toFixed(3);
    return sign + abs.slice(1);
  }
  return val.toFixed(1);
}

// ── Helpers replicated from lib/scoring-config.ts ─────────────────────────────
const safe = (n, d) => (d === 0 ? 0 : n / d);

// Key ESPN stat IDs used in tests (subset of ESPN_STAT_MAP)
const ESPN_STAT_MAP_TEST = {
  0:  { id: "PTS",  espnStatId: 0,  lowerIsBetter: false, compute: (t, gp) => safe(t[0],  Math.max(gp, 1)) },
  1:  { id: "BLK",  espnStatId: 1,  lowerIsBetter: false, compute: (t, gp) => safe(t[1],  Math.max(gp, 1)) },
  2:  { id: "STL",  espnStatId: 2,  lowerIsBetter: false, compute: (t, gp) => safe(t[2],  Math.max(gp, 1)) },
  3:  { id: "AST",  espnStatId: 3,  lowerIsBetter: false, compute: (t, gp) => safe(t[3],  Math.max(gp, 1)) },
  6:  { id: "REB",  espnStatId: 6,  lowerIsBetter: false, compute: (t, gp) => safe(t[6],  Math.max(gp, 1)) },
  11: { id: "TO",   espnStatId: 11, lowerIsBetter: true,  compute: (t, gp) => safe(t[11], Math.max(gp, 1)) },
  13: { id: "FGM",  espnStatId: 13, lowerIsBetter: false, compute: (t, gp) => safe(t[13], Math.max(gp, 1)) },
  14: { id: "FGA",  espnStatId: 14, lowerIsBetter: false, compute: (t, gp) => safe(t[14], Math.max(gp, 1)) },
  15: { id: "FTM",  espnStatId: 15, lowerIsBetter: false, compute: (t, gp) => safe(t[15], Math.max(gp, 1)) },
  16: { id: "FTA",  espnStatId: 16, lowerIsBetter: false, compute: (t, gp) => safe(t[16], Math.max(gp, 1)) },
  17: { id: "3PM",  espnStatId: 17, lowerIsBetter: false, compute: (t, gp) => safe(t[17], Math.max(gp, 1)) },
  19: { id: "FG%",  espnStatId: 19, lowerIsBetter: false, compute: (t) => safe(t[13], t[14]),              volumeStatIds: [13, 14] },
  20: { id: "FT%",  espnStatId: 20, lowerIsBetter: false, compute: (t) => safe(t[15], t[16]),              volumeStatIds: [15, 16] },
  21: { id: "3P%",  espnStatId: 21, lowerIsBetter: false, compute: (t) => safe(t[17], t[18]),              volumeStatIds: [17, 18] },
  22: { id: "AFG%", espnStatId: 22, lowerIsBetter: false, compute: (t) => safe((t[13]??0)+0.5*(t[17]??0), t[14]??0) },
};

// Display order used in sorting (matches ESPN_DISPLAY_ORDER in scoring-config.ts)
const ESPN_DISPLAY_ORDER_TEST = [42,41,40,13,14,23,19,22,15,16,24,20,17,18,25,21,4,5,6,3,35,2,36,1,11,7,8,9,10,12,37,38,39,0,34,43,44];
const displayRankTest = (id) => { const idx = ESPN_DISPLAY_ORDER_TEST.indexOf(id); return idx === -1 ? 999 : idx; };

const DEFAULT_SCORING_CONFIG_TEST = {
  format: "categories",
  cats: [
    ESPN_STAT_MAP_TEST[22], // AFG%
    ESPN_STAT_MAP_TEST[20], // FT%
    ESPN_STAT_MAP_TEST[17], // 3PM
    ESPN_STAT_MAP_TEST[6],  // REB
    ESPN_STAT_MAP_TEST[3],  // AST
    ESPN_STAT_MAP_TEST[2],  // STL
    ESPN_STAT_MAP_TEST[1],  // BLK
    ESPN_STAT_MAP_TEST[11], // TO
    ESPN_STAT_MAP_TEST[0],  // PTS
  ],
};

// ── Replicated parseLeagueScoringConfig (lib/scoring-config.ts) ───────────────
function parseLeagueScoringConfig(settings) {
  if (!settings || typeof settings !== "object") return DEFAULT_SCORING_CONFIG_TEST;
  const s = settings;
  const scoringSettings = s.scoringSettings;
  if (!scoringSettings) return DEFAULT_SCORING_CONFIG_TEST;

  const scoringItems = scoringSettings.scoringItems;
  if (!Array.isArray(scoringItems) || scoringItems.length === 0) return DEFAULT_SCORING_CONFIG_TEST;

  const scoringType = scoringSettings.scoringType ?? s.scoringType ?? "";
  const typeLower = scoringType.toLowerCase();

  const isPoints = typeLower.includes("point") && !typeLower.includes("categor");
  const isRoto   = typeLower.includes("roto") || typeLower.includes("rotisserie");

  if (isPoints) {
    const pointValues = {};
    const cats = [];
    for (const item of scoringItems) {
      const statId = typeof item.statId === "number" ? item.statId : parseInt(String(item.statId), 10);
      const pts    = typeof item.points === "number"  ? item.points  : 0;
      if (isNaN(statId) || pts === 0) continue;
      pointValues[statId] = pts;
      const cat = ESPN_STAT_MAP_TEST[statId];
      if (cat) cats.push(cat);
    }
    if (cats.length === 0) return DEFAULT_SCORING_CONFIG_TEST;
    cats.sort((a, b) => displayRankTest(a.espnStatId) - displayRankTest(b.espnStatId));
    return { format: "points", cats, pointValues };
  }

  const cats = [];
  for (const item of scoringItems) {
    const statId = typeof item.statId === "number" ? item.statId : parseInt(String(item.statId), 10);
    if (isNaN(statId)) continue;
    const cat = ESPN_STAT_MAP_TEST[statId];
    if (!cat) continue; // Unknown stat ID — skip
    const reverse = item.isReverseItem === true;
    cats.push(reverse !== cat.lowerIsBetter ? { ...cat, lowerIsBetter: reverse } : cat);
  }

  if (cats.length < 2) return DEFAULT_SCORING_CONFIG_TEST;
  cats.sort((a, b) => displayRankTest(a.espnStatId) - displayRankTest(b.espnStatId));
  return { format: isRoto ? "roto" : "categories", cats };
}

// ── Replicated aggregateStats (lib/stat-calculator.ts) ───────────────────────
function aggregateStatsNew(players, config) {
  if (players.length === 0) {
    if (config.format === "points") return { FPts: 0 };
    const empty = {};
    for (const cat of config.cats) empty[cat.id] = 0;
    return empty;
  }

  if (config.format === "points") {
    const pointValues = config.pointValues ?? {};
    let totalFPts = 0;
    for (const p of players) {
      const gp = Math.max(p.gp, 1);
      let fpts = 0;
      for (const [sidStr, ptVal] of Object.entries(pointValues)) {
        const sid = parseInt(sidStr, 10);
        fpts += (p.rawStats[sid] ?? 0) * ptVal;
      }
      totalFPts += fpts / gp;
    }
    return { FPts: totalFPts };
  }

  const perGame        = {};
  const perGameRounded = {};

  for (const p of players) {
    const gp = Math.max(p.gp, 1);
    for (const [sidStr, val] of Object.entries(p.rawStats)) {
      const sid = parseInt(sidStr, 10);
      if (isNaN(sid)) continue;
      // Basketball GP = stat 42, Hockey GP = stat 30 — both accumulate as raw totals
      if (sid === 42 || sid === 30) {
        perGame[sid] = (perGame[sid] ?? 0) + val;
      } else {
        const pgVal = val / gp;
        perGame[sid]        = (perGame[sid]        ?? 0) + pgVal;
        perGameRounded[sid] = (perGameRounded[sid] ?? 0) + Math.round(pgVal * 10) / 10;
      }
    }
  }

  const result = {};
  for (const cat of config.cats) {
    result[cat.id] = cat.compute(perGame, 1);
    if (cat.volumeStatIds) {
      result[cat.id + "_m"] = perGameRounded[cat.volumeStatIds[0]] ?? 0;
      result[cat.id + "_a"] = perGameRounded[cat.volumeStatIds[1]] ?? 0;
    }
  }
  return result;
}

// ── Replicated calcTradeScore with dynamic config (lib/trade-score.ts) ────────
function calcTradeScoreDynamic(giving, receiving, config) {
  if (config.format === "points") {
    const g = Math.round((giving["FPts"] ?? 0) * 10) / 10;
    const r = Math.round((receiving["FPts"] ?? 0) * 10) / 10;
    const delta = Math.round((r - g) * 10) / 10;
    const winner = delta > 0 ? "receiving" : delta < 0 ? "giving" : "push";
    return {
      results: [{ category: "FPts", giving: g, receiving: r, delta, winner, lowerIsBetter: false }],
      winsForReceiving: winner === "receiving" ? 1 : 0,
      losses:           winner === "giving"    ? 1 : 0,
      equals:           winner === "push"      ? 1 : 0,
      totalCats: 1,
    };
  }

  const results = config.cats.map((cat) => {
    const g = giving[cat.id] ?? 0;
    const r = receiving[cat.id] ?? 0;
    const isPct   = cat.id.endsWith("%");
    const factor  = isPct ? 10000 : 10;
    const rg      = Math.round(g * factor) / factor;
    const rr      = Math.round(r * factor) / factor;
    const delta   = Math.round((rr - rg) * factor) / factor;

    let winner;
    if (delta === 0) {
      if (isPct) {
        const rawDiff = r - g;
        if (rawDiff === 0)      winner = "push";
        else if (cat.lowerIsBetter) winner = rawDiff < 0 ? "receiving" : "giving";
        else                    winner = rawDiff > 0 ? "receiving" : "giving";
      } else {
        winner = "push";
      }
    } else if (cat.lowerIsBetter) {
      winner = delta < 0 ? "receiving" : "giving";
    } else {
      winner = delta > 0 ? "receiving" : "giving";
    }
    return { category: cat.id, giving: rg, receiving: rr, delta, winner, lowerIsBetter: cat.lowerIsBetter };
  });

  return {
    results,
    winsForReceiving: results.filter((r) => r.winner === "receiving").length,
    losses:           results.filter((r) => r.winner === "giving").length,
    equals:           results.filter((r) => r.winner === "push").length,
    totalCats: config.cats.length,
  };
}

// ── Replicated scoringConfigLabel (lib/scoring-config.ts) ────────────────────
function scoringConfigLabel(config) {
  if (config.format === "points") {
    const n = Object.keys(config.pointValues ?? {}).length;
    return `Points league · ${n} scoring stat${n !== 1 ? "s" : ""}`;
  }
  const fmtLabel = config.format === "roto" ? "Roto" : "H2H";
  const catList  = config.cats.map((c) => c.id).join(", ");
  return `${config.cats.length}-cat ${fmtLabel} · ${catList}`;
}

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 10 — fmt() with endsWith("%"): any % category uses .xxx format
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n─── Suite 10: fmt() with endsWith(%) — any % category ───");
{
  // Formerly only "AFG%" and "FT%" were detected by name; now any cat ending with %
  assert(fmtNew(0.45,   "FG%")  === ".450",  "FG% 0.45 → .450 (new %)");
  assert(fmtNew(0.378,  "3P%")  === ".378",  "3P% 0.378 → .378 (new %)");
  assert(fmtNew(0.550,  "AFG%") === ".550",  "AFG% still works (regression)");
  assert(fmtNew(0.800,  "FT%")  === ".800",  "FT% still works (regression)");
  assert(fmtNew(0.333,  "TS%")  === ".333",  "TS% (custom name) → .333");
  assert(fmtNew(0,      "FG%")  === ".000",  "FG% zero → .000");
  assert(fmtNew(-0.005, "FG%")  === "-.005", "FG% negative → -.005");
  // Count categories (not ending in %) stay as X.X
  assert(fmtNew(1.234,  "PPM")  === "1.2",   "PPM → count format X.X");
  assert(fmtNew(0.0,    "FPts") === "0.0",   "FPts → count format 0.0");
  assert(fmtNew(25.0,   "PTS")  === "25.0",  "PTS → count format 25.0");
  assert(fmtNew(-3.0,   "TO")   === "-3.0",  "TO → count format -3.0");
}

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 11 — calcTradeScore with dynamic config
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n─── Suite 11: calcTradeScore with dynamic config ───");
{
  // 11a — 9-cat default config: AFG% sub-precision still works
  {
    const g = { "AFG%":0.5503,"FT%":0.78,"3PM":10,"REB":40,"AST":25,"STL":8,"BLK":4,"TO":14,"PTS":100 };
    const r = { "AFG%":0.5497,"FT%":0.78,"3PM":10,"REB":40,"AST":25,"STL":8,"BLK":4,"TO":14,"PTS":100 };
    const res = calcTradeScoreDynamic(g, r, DEFAULT_SCORING_CONFIG_TEST);
    const afg = res.results.find((x) => x.category === "AFG%");
    assert(afg.winner === "giving",   "9-cat dynamic: AFG% sub-precision giving wins");
    assert(res.totalCats === 9,       "9-cat dynamic: totalCats=9");
    assert(res.losses === 1,          "9-cat dynamic: 1 giving-win (AFG%), rest push");
  }

  // 11b — Points format: giving wins
  {
    const configPoints = { format: "points", cats: [], pointValues: { 0: 1, 1: 2 } };
    const res = calcTradeScoreDynamic({ FPts: 52.5 }, { FPts: 48.0 }, configPoints);
    assert(res.results.length === 1,                  "points: single result row");
    assert(res.results[0].category === "FPts",        "points: category is FPts");
    assert(res.results[0].winner === "giving",         "points: giving wins (52.5 > 48.0)");
    assert(res.losses === 1,                           "points: losses=1");
    assert(res.totalCats === 1,                        "points: totalCats=1");
    assert(res.results[0].lowerIsBetter === false,     "points FPts: lowerIsBetter=false");
  }

  // 11c — Points format: tie
  {
    const configPoints = { format: "points", cats: [], pointValues: { 0: 1 } };
    const res = calcTradeScoreDynamic({ FPts: 50.0 }, { FPts: 50.0 }, configPoints);
    assert(res.results[0].winner === "push", "points: equal FPts → push");
    assert(res.equals === 1,                 "points: equals=1 on tie");
  }

  // 11d — Custom 3-cat config: PTS (higher better) + REB (higher better) + TO (lower better)
  {
    const config3 = {
      format: "categories",
      cats: [ESPN_STAT_MAP_TEST[0], ESPN_STAT_MAP_TEST[6], ESPN_STAT_MAP_TEST[11]],
    };
    const g3 = { PTS: 120, REB: 35, TO: 10 };
    const r3 = { PTS: 100, REB: 45, TO: 14 };
    const res = calcTradeScoreDynamic(g3, r3, config3);
    assert(res.totalCats === 3,                                               "3-cat: totalCats=3");
    assert(res.results.find((x) => x.category==="PTS").winner === "giving",   "3-cat: PTS giving wins");
    assert(res.results.find((x) => x.category==="REB").winner === "receiving","3-cat: REB receiving wins");
    assert(res.results.find((x) => x.category==="TO" ).winner === "giving",   "3-cat: TO giving wins (lower=better, 10<14)");
    assert(res.losses === 2,            "3-cat: 2 giving-wins");
    assert(res.winsForReceiving === 1,  "3-cat: 1 receiving-win");
  }

  // 11e — FG% sub-precision fix works (endsWith(%) path, not old name-check)
  {
    const configFG = { format: "categories", cats: [ESPN_STAT_MAP_TEST[19]] }; // FG%
    const res = calcTradeScoreDynamic({ "FG%": 0.45004 }, { "FG%": 0.44996 }, configFG);
    const row = res.results[0];
    assert(row.winner === "giving", "FG% sub-precision (5th decimal): giving wins");
    assert(row.delta  === 0,        "FG% sub-precision: delta=0 (rounds to same .4500)");
  }

  // 11f — lowerIsBetter override: TO with lowerIsBetter forced false
  {
    const catTOHigh = { ...ESPN_STAT_MAP_TEST[11], lowerIsBetter: false }; // unusual override
    const config    = { format: "categories", cats: [catTOHigh] };
    const res = calcTradeScoreDynamic({ TO: 15 }, { TO: 12 }, config);
    // Higher is better → receiving (12) loses; giving (15) wins
    assert(res.results[0].winner === "giving",
      "TO with lowerIsBetter=false: giving (15 > 12) wins");
  }

  // 11g — All cats equal → all push, totalCats correct
  {
    const config2 = { format: "categories", cats: [ESPN_STAT_MAP_TEST[0], ESPN_STAT_MAP_TEST[6]] };
    const res = calcTradeScoreDynamic({ PTS: 100, REB: 40 }, { PTS: 100, REB: 40 }, config2);
    assert(res.equals === 2,            "all equal: 2 pushes");
    assert(res.winsForReceiving === 0,  "all equal: 0 receiving wins");
    assert(res.losses === 0,            "all equal: 0 giving wins");
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 12 — aggregateStats: perGameRounded volume display fix
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n─── Suite 12: aggregateStats — perGameRounded volume display ───");
{
  const configFT  = { format: "categories", cats: [ESPN_STAT_MAP_TEST[20]] }; // FT%
  const configFG  = { format: "categories", cats: [ESPN_STAT_MAP_TEST[19]] }; // FG%
  const configAFG = { format: "categories", cats: [ESPN_STAT_MAP_TEST[22]] }; // AFG%
  const configPTS = { format: "categories", cats: [ESPN_STAT_MAP_TEST[0]]  }; // PTS

  // 12a — Single player: volume equals per-game values exactly
  {
    const p = { gp: 10, rawStats: { 15: 80, 16: 100 } }; // FTM=80, FTA=100 → 8.0/10.0 per game
    const r = aggregateStatsNew([p], configFT);
    assert(Math.abs(r["FT%"] - 0.8) < 0.0001, "single player FT% = 0.800");
    assert(r["FT%_m"] === 8.0,                 "single player FT%_m = 8.0");
    assert(r["FT%_a"] === 10.0,                "single player FT%_a = 10.0");
  }

  // 12b — The key rounding-divergence case
  //   Player A: FTM=5, FTA=6, GP=3 → exact 1.6667/2.0, rounded 1.7/2.0
  //   Player B: FTM=2, FTA=3, GP=3 → exact 0.6667/1.0, rounded 0.7/1.0
  //   perGame exact:    FTM=2.3333  FTA=3.0  → FT%=7/9≈0.7778  → display "2.3" for FTM
  //   perGameRounded:   FTM=2.4     FTA=3.0  → display "2.4" (matches ESPN: 1.7+0.7)
  {
    const pA = { gp: 3, rawStats: { 15: 5, 16: 6 } };
    const pB = { gp: 3, rawStats: { 15: 2, 16: 3 } };
    const r  = aggregateStatsNew([pA, pB], configFT);
    assert(Math.abs(r["FT%"] - 7/9) < 0.0001, "two-player FT% uses exact (7/9 ≈ 0.7778)");
    assert(Math.abs(r["FT%_m"] - 2.4) < 0.001,"two-player FT%_m = 2.4 (perGameRounded)");
    assert(Math.abs(r["FT%_a"] - 3.0) < 0.001,"two-player FT%_a = 3.0");
    // Confirm the divergence — exact sum would display differently
    const exactFTM = 5/3 + 2/3;
    assert(exactFTM.toFixed(1) === "2.3", "exact FTM sum displays as 2.3 (shows why rounding matters)");
    assert((2.4).toFixed(1)    === "2.4", "rounded FTM sum displays as 2.4 (matches ESPN)");
  }

  // 12c — FG% with volumeStatIds
  {
    const p = { gp: 5, rawStats: { 13: 20, 14: 40 } }; // 4.0/8.0 per game
    const r = aggregateStatsNew([p], configFG);
    assert(Math.abs(r["FG%"] - 0.5) < 0.0001, "FG% = 0.500");
    assert(r["FG%_m"] === 4.0,                 "FG%_m = 4.0");
    assert(r["FG%_a"] === 8.0,                 "FG%_a = 8.0");
  }

  // 12d — AFG% (no volumeStatIds) → no _m/_a fields produced
  {
    const p = { gp: 5, rawStats: { 13: 20, 14: 40, 17: 5 } };
    // AFG% = (FGM + 0.5×3PM) / FGA = (4.0 + 0.5×1.0) / 8.0 = 4.5/8.0 = 0.5625
    const r = aggregateStatsNew([p], configAFG);
    assert(Math.abs(r["AFG%"] - 0.5625) < 0.0001, "AFG% = 0.5625");
    assert(r["AFG%_m"] === undefined,              "AFG% has no _m field (no volumeStatIds)");
  }

  // 12e — Counting stat: combined per-game contribution sums correctly
  {
    const p1 = { gp: 10, rawStats: { 0: 300 } }; // 30.0 PTS/game
    const p2 = { gp: 10, rawStats: { 0: 200 } }; // 20.0 PTS/game
    const r  = aggregateStatsNew([p1, p2], configPTS);
    assert(Math.abs(r["PTS"] - 50.0) < 0.001, "PTS: 30+20=50 combined per game");
  }

  // 12f — Points league: FPts calculated per-player then summed
  {
    const configPoints = {
      format: "points",
      cats: [],
      pointValues: { 0: 1, 1: 2, 2: 3 }, // PTS=1, BLK=2, STL=3
    };
    // Player: PTS=100, BLK=5, STL=3, GP=10 → FPts/game = (100+10+9)/10 = 11.9
    const p = { gp: 10, rawStats: { 0: 100, 1: 5, 2: 3 } };
    const r = aggregateStatsNew([p], configPoints);
    assert(Math.abs(r["FPts"] - 11.9) < 0.001, "points league FPts = 11.9");
  }

  // 12g — Empty player list (categories) → all zeros
  {
    const r = aggregateStatsNew([], configFT);
    assert(r["FT%"] === 0, "empty players (cats) → FT%=0");
  }

  // 12h — Empty player list (points) → FPts=0
  {
    const configPoints = { format: "points", cats: [], pointValues: { 0: 1 } };
    const r = aggregateStatsNew([], configPoints);
    assert(r["FPts"] === 0, "empty players (points) → FPts=0");
  }

  // 12i — GP stat (id 42) is NOT divided by gp — accumulated as raw total
  {
    const configGP = {
      format: "categories",
      cats: [{ id: "GP", espnStatId: 42, lowerIsBetter: false,
               compute: (t, gp) => safe(t[42] ?? 0, Math.max(gp, 1)) }],
    };
    const p1 = { gp: 10, rawStats: { 42: 10 } };
    const p2 = { gp: 8,  rawStats: { 42: 8  } };
    // GP should be raw sum (18), then compute divides by gp=1 since perGame
    const r = aggregateStatsNew([p1, p2], configGP);
    assert(Math.abs(r["GP"] - 18) < 0.001, "GP accumulates as raw sum (18 total)");
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 13 — parseLeagueScoringConfig
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n─── Suite 13: parseLeagueScoringConfig ───");
{
  // 13a — null/undefined → DEFAULT fallback
  const d1 = parseLeagueScoringConfig(null);
  assert(d1.format === "categories",  "null settings → DEFAULT (categories)");
  assert(d1.cats.length === 9,        "null settings → DEFAULT (9 cats)");

  // 13b — missing scoringSettings → DEFAULT fallback
  const d2 = parseLeagueScoringConfig({ season: 2026 });
  assert(d2.format === "categories",  "missing scoringSettings → DEFAULT");
  assert(d2.cats.length === 9,        "missing scoringSettings → DEFAULT 9 cats");

  // 13c — empty scoringItems → DEFAULT fallback
  const d3 = parseLeagueScoringConfig({
    scoringSettings: { scoringType: "H2H_MOST_CATEGORIES", scoringItems: [] },
  });
  assert(d3.format === "categories",  "empty scoringItems → DEFAULT");
  assert(d3.cats.length === 9,        "empty scoringItems → DEFAULT 9 cats");

  // 13d — H2H categories: format + isReverseItem
  const d4 = parseLeagueScoringConfig({
    scoringSettings: {
      scoringType: "H2H_MOST_CATEGORIES",
      scoringItems: [
        { statId: 0,  isReverseItem: false }, // PTS
        { statId: 6,  isReverseItem: false }, // REB
        { statId: 11, isReverseItem: true  }, // TO (lower is better)
      ],
    },
  });
  assert(d4.format === "categories",                              "H2H_MOST_CATEGORIES → format=categories");
  assert(d4.cats.length === 3,                                    "H2H: 3 cats parsed");
  assert(d4.cats.find((c) => c.id==="TO" )?.lowerIsBetter===true,"TO: lowerIsBetter=true");
  assert(d4.cats.find((c) => c.id==="PTS")?.lowerIsBetter===false,"PTS: lowerIsBetter=false");

  // 13e — Points league: pointValues populated
  const d5 = parseLeagueScoringConfig({
    scoringSettings: {
      scoringType: "H2H_POINTS",
      scoringItems: [
        { statId: 0,  points:  1 },  // PTS
        { statId: 1,  points:  2 },  // BLK
        { statId: 11, points: -1 },  // TO (negative)
      ],
    },
  });
  assert(d5.format === "points",         "H2H_POINTS → format=points");
  assert(d5.pointValues[0]  ===  1,      "points: PTS=1");
  assert(d5.pointValues[1]  ===  2,      "points: BLK=2");
  assert(d5.pointValues[11] === -1,      "points: TO=-1");
  assert(d5.cats.length === 3,           "points: 3 cats");

  // 13f — Roto league
  const d6 = parseLeagueScoringConfig({
    scoringSettings: {
      scoringType: "ROTO",
      scoringItems: [
        { statId: 0,  isReverseItem: false },
        { statId: 6,  isReverseItem: false },
        { statId: 11, isReverseItem: true  },
      ],
    },
  });
  assert(d6.format === "roto",  "ROTO → format=roto");
  assert(d6.cats.length === 3,  "roto: 3 cats parsed");

  // 13g — Unknown stat IDs are skipped silently
  const d7 = parseLeagueScoringConfig({
    scoringSettings: {
      scoringType: "H2H_MOST_CATEGORIES",
      scoringItems: [
        { statId: 0,   isReverseItem: false }, // PTS — known
        { statId: 999, isReverseItem: false }, // unknown — skip
        { statId: 6,   isReverseItem: false }, // REB — known
      ],
    },
  });
  assert(d7.cats.length === 2,                        "unknown stat 999 skipped → 2 cats");
  assert(!d7.cats.find((c) => c.espnStatId === 999),  "no cat with espnStatId=999");

  // 13h — Only 1 known cat (after unknown skip) → DEFAULT fallback (< 2 cats)
  const d8 = parseLeagueScoringConfig({
    scoringSettings: {
      scoringType: "H2H_MOST_CATEGORIES",
      scoringItems: [
        { statId: 0,   isReverseItem: false }, // PTS — 1 known
        { statId: 999, isReverseItem: false }, // unknown — skip
      ],
    },
  });
  assert(d8.cats.length === 9, "1 known cat → DEFAULT fallback (< 2 cats)");

  // 13i — Points league: 0-value stat excluded
  const d9 = parseLeagueScoringConfig({
    scoringSettings: {
      scoringType: "H2H_POINTS",
      scoringItems: [
        { statId: 0, points: 1 },
        { statId: 6, points: 0 }, // pts=0 → skip
      ],
    },
  });
  assert(Object.keys(d9.pointValues).length === 1, "points: 0-value stat excluded from pointValues");
  assert(d9.cats.length === 1,                      "points: 0-value cat not in cats array");

  // 13j — isReverseItem overrides default lowerIsBetter
  const d10 = parseLeagueScoringConfig({
    scoringSettings: {
      scoringType: "H2H_MOST_CATEGORIES",
      scoringItems: [
        { statId: 0, isReverseItem: true  }, // PTS forced lower-is-better (unusual)
        { statId: 6, isReverseItem: false },
      ],
    },
  });
  assert(d10.cats.find((c) => c.id==="PTS")?.lowerIsBetter === true,
    "isReverseItem=true overrides PTS to lowerIsBetter=true");

  // 13k — Cats sorted by ESPN display order regardless of input order
  const d11 = parseLeagueScoringConfig({
    scoringSettings: {
      scoringType: "H2H_MOST_CATEGORIES",
      scoringItems: [
        { statId: 0,  isReverseItem: false }, // PTS (display rank 33)
        { statId: 6,  isReverseItem: false }, // REB (display rank 18)
        { statId: 13, isReverseItem: false }, // FGM (display rank  3)
      ],
    },
  });
  assert(d11.cats[0].id === "FGM", "sorted: FGM first (lowest display rank)");
  assert(d11.cats[1].id === "REB", "sorted: REB second");
  assert(d11.cats[2].id === "PTS", "sorted: PTS last");

  // 13l — scoringType at top level (fallback field path)
  const d12 = parseLeagueScoringConfig({
    scoringType: "ROTO",
    scoringSettings: {
      scoringItems: [
        { statId: 0, isReverseItem: false },
        { statId: 6, isReverseItem: false },
      ],
    },
  });
  // scoringType at root but no scoringSettings.scoringType → scoringType from s.scoringType
  assert(d12.format === "roto", "scoringType from root-level field → roto");
}

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 14 — scoringConfigLabel
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n─── Suite 14: scoringConfigLabel ───");
{
  // 14a — 9-cat H2H default
  const label9 = scoringConfigLabel(DEFAULT_SCORING_CONFIG_TEST);
  assert(label9.startsWith("9-cat H2H ·"), "9-cat H2H label prefix");
  assert(label9.includes("AFG%"),           "9-cat label includes AFG%");
  assert(label9.includes("PTS"),            "9-cat label includes PTS");
  assert(label9.includes("FT%"),            "9-cat label includes FT%");

  // 14b — Points league (multiple stats)
  const configPts8 = { format: "points", cats: [], pointValues: { 0:1,1:2,2:3,3:1,6:1,11:-1,17:1,15:0.5 } };
  assert(scoringConfigLabel(configPts8) === "Points league · 8 scoring stats",
    "8 scoring stats (plural)");

  // 14c — Points league (1 stat — singular)
  const configPts1 = { format: "points", cats: [], pointValues: { 0: 1 } };
  assert(scoringConfigLabel(configPts1) === "Points league · 1 scoring stat",
    "1 scoring stat (singular)");

  // 14d — Points league (0 stats)
  const configPts0 = { format: "points", cats: [], pointValues: {} };
  assert(scoringConfigLabel(configPts0) === "Points league · 0 scoring stats",
    "0 scoring stats (plural)");

  // 14e — Roto label uses "Roto" not "H2H"
  const configRoto = {
    format: "roto",
    cats: [ESPN_STAT_MAP_TEST[0], ESPN_STAT_MAP_TEST[6], ESPN_STAT_MAP_TEST[3]],
  };
  assert(scoringConfigLabel(configRoto) === "3-cat Roto · PTS, REB, AST",
    "3-cat Roto label");

  // 14f — Categories label
  const config4 = {
    format: "categories",
    cats: [ESPN_STAT_MAP_TEST[0], ESPN_STAT_MAP_TEST[6], ESPN_STAT_MAP_TEST[3], ESPN_STAT_MAP_TEST[11]],
  };
  assert(scoringConfigLabel(config4) === "4-cat H2H · PTS, REB, AST, TO",
    "4-cat H2H label");

  // 14g — Single cat (edge case, format still correct)
  const config1 = { format: "categories", cats: [ESPN_STAT_MAP_TEST[0]] };
  assert(scoringConfigLabel(config1) === "1-cat H2H · PTS", "1-cat H2H label");
}

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 15 — Volume cat name extraction (trade page note logic)
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n─── Suite 15: Volume category name extraction ───");
{
  // Logic from trade/page.tsx: cats.filter(c=>c.volumeStatIds).map(c=>c.id.replace("%","").trim()).join(", ")
  const volNames = (cats) =>
    cats.filter((c) => c.volumeStatIds).map((c) => c.id.replace("%", "").trim()).join(", ");

  // 15a — Default 9-cat: only FT% has volumeStatIds
  assert(volNames(DEFAULT_SCORING_CONFIG_TEST.cats) === "FT",
    "9-cat default: only 'FT' in volume note");

  // 15b — FG% + FT% + 3P%
  const catsAll3 = [ESPN_STAT_MAP_TEST[19], ESPN_STAT_MAP_TEST[20], ESPN_STAT_MAP_TEST[21]];
  assert(volNames(catsAll3) === "FG, FT, 3P",
    "FG%, FT%, 3P% → 'FG, FT, 3P'");

  // 15c — AFG% excluded (no volumeStatIds), FT% included
  const catsAFGFT = [ESPN_STAT_MAP_TEST[22], ESPN_STAT_MAP_TEST[20]];
  assert(volNames(catsAFGFT) === "FT",
    "AFG% excluded (no volumeStatIds), FT shown");

  // 15d — No % cats at all → empty string
  const catsCount = [ESPN_STAT_MAP_TEST[0], ESPN_STAT_MAP_TEST[6], ESPN_STAT_MAP_TEST[11]];
  assert(volNames(catsCount) === "",
    "no volume cats → empty string");

  // 15e — % removal from cat id labels
  assert("FT%".replace("%","").trim() === "FT",   "FT% → FT");
  assert("FG%".replace("%","").trim() === "FG",   "FG% → FG");
  assert("3P%".replace("%","").trim() === "3P",   "3P% → 3P");
  assert("AFG%".replace("%","").trim() === "AFG", "AFG% → AFG (if ever included)");

  // 15f — No volume note when pointValues config (points leagues use FPts, no volume)
  const configPoints = { format: "points", cats: [], pointValues: { 0: 1 } };
  assert(volNames(configPoints.cats) === "",
    "points league: no volume cats in empty cats array");
}

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 16 — NHL stat map: compute functions and lowerIsBetter flags
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n─── Suite 16: NHL stat map — compute functions ───");
{
  const safe = (n, d) => d === 0 ? 0 : n / d;

  // Replicate the key NHL_STAT_MAP entries from lib/scoring-config.ts
  const NHL = {
    0:  { id: "GS",   compute: (t, gp) => safe(t[0]  ?? 0, Math.max(gp, 1)), lowerIsBetter: false },
    1:  { id: "W",    compute: (t, gp) => safe(t[1]  ?? 0, Math.max(gp, 1)), lowerIsBetter: false },
    2:  { id: "L",    compute: (t, gp) => safe(t[2]  ?? 0, Math.max(gp, 1)), lowerIsBetter: true  },
    3:  { id: "SA",   compute: (t, gp) => safe(t[3]  ?? 0, Math.max(gp, 1)), lowerIsBetter: false },
    4:  { id: "GA",   compute: (t, gp) => safe(t[4]  ?? 0, Math.max(gp, 1)), lowerIsBetter: true  },
    6:  { id: "SV",   compute: (t, gp) => safe(t[6]  ?? 0, Math.max(gp, 1)), lowerIsBetter: false },
    7:  { id: "SO",   compute: (t, gp) => safe(t[7]  ?? 0, Math.max(gp, 1)), lowerIsBetter: false },
    8:  { id: "GTOI", compute: (t, gp) => safe(t[8]  ?? 0, Math.max(gp, 1)), lowerIsBetter: false },
    9:  { id: "OTL",  compute: (t, gp) => safe(t[9]  ?? 0, Math.max(gp, 1)), lowerIsBetter: true  },
    // GAA = GA × 3600 / TOI_sec (volume-weighted across goalies)
    10: { id: "GAA",  compute: (t) => safe((t[4] ?? 0) * 3600, t[8] ?? 0),            lowerIsBetter: true  },
    // SV% = SV / SA (volume-weighted)
    11: { id: "SV%",  compute: (t) => safe(t[6] ?? 0, t[3] ?? 0), lowerIsBetter: false, volumeStatIds: [6, 3] },
    // W% = W / (W + L + OTL)
    12: { id: "W%",   compute: (t) => safe(t[1] ?? 0, (t[1]??0)+(t[2]??0)+(t[9]??0)), lowerIsBetter: false },
    13: { id: "G",    compute: (t, gp) => safe(t[13] ?? 0, Math.max(gp, 1)), lowerIsBetter: false },
    14: { id: "A",    compute: (t, gp) => safe(t[14] ?? 0, Math.max(gp, 1)), lowerIsBetter: false },
    15: { id: "+/-",  compute: (t, gp) => safe(t[15] ?? 0, Math.max(gp, 1)), lowerIsBetter: false },
    16: { id: "PTS",  compute: (t, gp) => safe(t[16] ?? 0, Math.max(gp, 1)), lowerIsBetter: false },
    17: { id: "PPP",  compute: (t, gp) => safe(t[17] ?? 0, Math.max(gp, 1)), lowerIsBetter: false },
    24: { id: "FOL",  compute: (t, gp) => safe(t[24] ?? 0, Math.max(gp, 1)), lowerIsBetter: true  },
    29: { id: "SOG",  compute: (t, gp) => safe(t[29] ?? 0, Math.max(gp, 1)), lowerIsBetter: false },
    30: { id: "GP",   compute: (t, gp) => safe(t[30] ?? 0, Math.max(gp, 1)), lowerIsBetter: false },
    32: { id: "HIT",  compute: (t, gp) => safe(t[32] ?? 0, Math.max(gp, 1)), lowerIsBetter: false },
    33: { id: "BLK",  compute: (t, gp) => safe(t[33] ?? 0, Math.max(gp, 1)), lowerIsBetter: false },
  };

  // 16a — Counting stats: per-game division
  assert(Math.abs(NHL[13].compute({13: 35}, 61) - 35/61) < 0.0001, "G: 35 goals / 61 GP");
  assert(Math.abs(NHL[14].compute({14: 68}, 61) - 68/61) < 0.0001, "A: 68 assists / 61 GP");
  assert(Math.abs(NHL[29].compute({29: 228}, 61) - 228/61) < 0.0001, "SOG / GP");
  assert(Math.abs(NHL[32].compute({32: 23}, 61) - 23/61) < 0.0001,  "HIT / GP");

  // 16b — GAA: confirmed from Vasilevskiy 2025-26 data (GA=85, TOI_sec=138064)
  const gaaTotals = { 4: 85, 8: 138064 };
  assert(Math.abs(NHL[10].compute(gaaTotals) - (85*3600/138064)) < 0.00001, "GAA = GA×3600/TOI_sec");
  assert(Math.abs(NHL[10].compute(gaaTotals) - 2.2164) < 0.001, "GAA ≈ 2.216 (Vasilevskiy season)");
  assert(NHL[10].lowerIsBetter === true, "GAA: lowerIsBetter=true");

  // 16c — GAA with TOI=0 → 0 (safe division guard)
  assert(NHL[10].compute({ 4: 10, 8: 0 }) === 0, "GAA with TOI=0 → 0 (safe)");

  // 16d — SV%: confirmed from Vasilevskiy data (SV=924, SA=1009)
  const svTotals = { 6: 924, 3: 1009 };
  assert(Math.abs(NHL[11].compute(svTotals) - 924/1009) < 0.00001, "SV% = SV/SA");
  assert(Math.abs(NHL[11].compute(svTotals) - 0.9158) < 0.001, "SV% ≈ .916 (Vasilevskiy)");
  assert(NHL[11].lowerIsBetter === false, "SV%: lowerIsBetter=false");
  assert(Array.isArray(NHL[11].volumeStatIds), "SV% has volumeStatIds");
  assert(NHL[11].volumeStatIds[0] === 6 && NHL[11].volumeStatIds[1] === 3, "SV% volumeStatIds=[6,3]");

  // 16e — SV% with SA=0 → 0 (no shots faced)
  assert(NHL[11].compute({ 6: 0, 3: 0 }) === 0, "SV% with SA=0 → 0 (safe)");

  // 16f — W%: W/(W+L+OTL)
  const wTotals = { 1: 28, 2: 8, 9: 3 };
  assert(Math.abs(NHL[12].compute(wTotals) - 28/39) < 0.00001, "W% = W/(W+L+OTL)");
  assert(NHL[12].lowerIsBetter === false, "W%: lowerIsBetter=false");

  // 16g — lowerIsBetter flags: loss/penalty/against stats
  assert(NHL[2].lowerIsBetter  === true,  "L:   lowerIsBetter=true");
  assert(NHL[4].lowerIsBetter  === true,  "GA:  lowerIsBetter=true");
  assert(NHL[9].lowerIsBetter  === true,  "OTL: lowerIsBetter=true");
  assert(NHL[24].lowerIsBetter === true,  "FOL: lowerIsBetter=true");
  assert(NHL[1].lowerIsBetter  === false, "W:   lowerIsBetter=false");
  assert(NHL[7].lowerIsBetter  === false, "SO:  lowerIsBetter=false");
  assert(NHL[13].lowerIsBetter === false, "G:   lowerIsBetter=false");
  assert(NHL[17].lowerIsBetter === false, "PPP: lowerIsBetter=false");

  // 16h — GP=0 guard: Math.max(gp,1) prevents division by zero
  assert(NHL[13].compute({ 13: 10 }, 0) === 10, "G with GP=0 → divides by 1 (guard)");
  assert(NHL[29].compute({ 29: 5  }, 0) === 5,  "SOG with GP=0 → divides by 1 (guard)");
}

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 17 — aggregateStats: hockey GP (stat 30) accumulates as raw total
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n─── Suite 17: aggregateStats — hockey GP (stat 30) as raw total ───");
{
  const safe = (n, d) => d === 0 ? 0 : n / d;
  const nhlGP  = { id: "GP",  espnStatId: 30, lowerIsBetter: false, compute: (t, gp) => safe(t[30] ?? 0, Math.max(gp, 1)) };
  const nhlG   = { id: "G",   espnStatId: 13, lowerIsBetter: false, compute: (t, gp) => safe(t[13] ?? 0, Math.max(gp, 1)) };
  const nhlGAA = { id: "GAA", espnStatId: 10, lowerIsBetter: true,  compute: (t) => safe((t[4] ?? 0) * 3600, t[8] ?? 0) };
  const nhlSVP = { id: "SV%", espnStatId: 11, lowerIsBetter: false, compute: (t) => safe(t[6] ?? 0, t[3] ?? 0), volumeStatIds: [6, 3] };

  // 17a — Hockey GP (stat 30) accumulates as raw sum, not divided by gp
  {
    const cfgGP = { format: "categories", cats: [nhlGP] };
    const p1 = { gp: 39, rawStats: { 30: 39 } }; // Vasilevskiy
    const p2 = { gp: 31, rawStats: { 30: 31 } }; // backup goalie
    const r = aggregateStatsNew([p1, p2], cfgGP);
    assert(Math.abs(r["GP"] - 70) < 0.001, "hockey GP (stat 30): raw sum 39+31=70");
  }

  // 17b — Basketball GP (stat 42) also still accumulates as raw sum (regression)
  {
    const bbaGP = { id: "GP", espnStatId: 42, lowerIsBetter: false, compute: (t, gp) => safe(t[42] ?? 0, Math.max(gp, 1)) };
    const cfgGP = { format: "categories", cats: [bbaGP] };
    const p1 = { gp: 10, rawStats: { 42: 10 } };
    const p2 = { gp: 8,  rawStats: { 42: 8  } };
    const r = aggregateStatsNew([p1, p2], cfgGP);
    assert(Math.abs(r["GP"] - 18) < 0.001, "basketball GP (stat 42): raw sum 18 (regression)");
  }

  // 17c — Hockey counting stat (G) is per-game then summed across players
  {
    const cfgG = { format: "categories", cats: [nhlG] };
    // Player A: 35 G / 61 GP = 0.5738/g; Player B: 20 G / 50 GP = 0.400/g
    const pA = { gp: 61, rawStats: { 13: 35 } };
    const pB = { gp: 50, rawStats: { 13: 20 } };
    const r = aggregateStatsNew([pA, pB], cfgG);
    const expected = 35/61 + 20/50;
    assert(Math.abs(r["G"] - expected) < 0.0001, "G: per-game sum (35/61 + 20/50)");
  }

  // 17d — SV% volume-weighted across two goalies
  {
    const cfgSVP = { format: "categories", cats: [nhlSVP] };
    // Goalie A: SV=800, SA=870 → SV%=0.9195
    // Goalie B: SV=150, SA=175 → SV%=0.8571
    // Combined (perGame, gp=1 each): SV=800+150=950, SA=870+175=1045 → SV%=950/1045=0.9091
    const pA = { gp: 50, rawStats: { 6: 800, 3: 870 } };
    const pB = { gp: 20, rawStats: { 6: 150, 3: 175 } };
    const r = aggregateStatsNew([pA, pB], cfgSVP);
    // perGame[6] = 800/50 + 150/20 = 16 + 7.5 = 23.5; perGame[3] = 870/50 + 175/20 = 17.4 + 8.75 = 26.15
    // SV% = 23.5 / 26.15 = 0.8986
    const expectedSVP = (800/50 + 150/20) / (870/50 + 175/20);
    assert(Math.abs(r["SV%"] - expectedSVP) < 0.00001, "SV%: volume-weighted across two goalies");
  }

  // 17e — GAA volume-weighted across two goalies
  {
    const cfgGAA = { format: "categories", cats: [nhlGAA] };
    // perGame[4] = GA_A/GP_A + GA_B/GP_B; perGame[8] = TOI_A/GP_A + TOI_B/GP_B
    // GAA = perGame[4] * 3600 / perGame[8]
    const pA = { gp: 40, rawStats: { 4: 80,  8: 140000 } }; // 2.0 GA/g, ~58.3 min/g
    const pB = { gp: 20, rawStats: { 4: 60,  8:  68000 } }; // 3.0 GA/g, ~56.7 min/g
    const r = aggregateStatsNew([pA, pB], cfgGAA);
    const pgGA  = 80/40  + 60/20;     // 2.0 + 3.0 = 5.0
    const pgTOI = 140000/40 + 68000/20; // 3500 + 3400 = 6900
    const expectedGAA = pgGA * 3600 / pgTOI;
    assert(Math.abs(r["GAA"] - expectedGAA) < 0.00001, "GAA: volume-weighted across two goalies");
    // Simple average would be (2.0+3.0)/2=2.5; volume-weighted differs
    assert(Math.abs(r["GAA"] - 2.5) > 0.01, "GAA volume-weighted differs from simple average");
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 18 — parseLeagueScoringConfig with NHL sport cfg
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n─── Suite 18: parseLeagueScoringConfig with NHL sport cfg ───");
{
  // Replicate the sport-cfg-aware parseLeagueScoringConfig (the cfg parameter added for hockey)
  const safe = (n, d) => d === 0 ? 0 : n / d;

  const NHL_STAT_MAP_TEST = {
    1:  { id: "W",   espnStatId: 1,  lowerIsBetter: false, compute: (t, gp) => safe(t[1]  ?? 0, Math.max(gp, 1)) },
    2:  { id: "L",   espnStatId: 2,  lowerIsBetter: true,  compute: (t, gp) => safe(t[2]  ?? 0, Math.max(gp, 1)) },
    7:  { id: "SO",  espnStatId: 7,  lowerIsBetter: false, compute: (t, gp) => safe(t[7]  ?? 0, Math.max(gp, 1)) },
    9:  { id: "OTL", espnStatId: 9,  lowerIsBetter: true,  compute: (t, gp) => safe(t[9]  ?? 0, Math.max(gp, 1)) },
    10: { id: "GAA", espnStatId: 10, lowerIsBetter: true,  compute: (t) => safe((t[4] ?? 0) * 3600, t[8] ?? 0) },
    11: { id: "SV%", espnStatId: 11, lowerIsBetter: false, compute: (t) => safe(t[6] ?? 0, t[3] ?? 0), volumeStatIds: [6, 3] },
    13: { id: "G",   espnStatId: 13, lowerIsBetter: false, compute: (t, gp) => safe(t[13] ?? 0, Math.max(gp, 1)) },
    14: { id: "A",   espnStatId: 14, lowerIsBetter: false, compute: (t, gp) => safe(t[14] ?? 0, Math.max(gp, 1)) },
    15: { id: "+/-", espnStatId: 15, lowerIsBetter: false, compute: (t, gp) => safe(t[15] ?? 0, Math.max(gp, 1)) },
    17: { id: "PPP", espnStatId: 17, lowerIsBetter: false, compute: (t, gp) => safe(t[17] ?? 0, Math.max(gp, 1)) },
    29: { id: "SOG", espnStatId: 29, lowerIsBetter: false, compute: (t, gp) => safe(t[29] ?? 0, Math.max(gp, 1)) },
    32: { id: "HIT", espnStatId: 32, lowerIsBetter: false, compute: (t, gp) => safe(t[32] ?? 0, Math.max(gp, 1)) },
  };

  // NHL_DISPLAY_ORDER: skater stats (13,14,15,17,29,32) before goalie stats (1,10,11,7)
  const NHL_DISPLAY_ORDER_TEST = [13, 14, 15, 17, 29, 32, 1, 2, 9, 10, 11, 7];
  const NHL_DEFAULT_TEST = {
    format: "categories",
    cats: [NHL_STAT_MAP_TEST[13], NHL_STAT_MAP_TEST[14], NHL_STAT_MAP_TEST[15],
           NHL_STAT_MAP_TEST[17], NHL_STAT_MAP_TEST[29], NHL_STAT_MAP_TEST[32],
           NHL_STAT_MAP_TEST[1],  NHL_STAT_MAP_TEST[10], NHL_STAT_MAP_TEST[11], NHL_STAT_MAP_TEST[7]],
    pointValues: {},
  };

  function parseLeagueScoringConfigWithSport(settings, cfg) {
    const statMap      = cfg?.statMap      ?? ESPN_STAT_MAP_TEST;
    const displayOrder = cfg?.statDisplayOrder ?? [];
    const fallback     = cfg?.defaultScoringConfig ?? DEFAULT_SCORING_CONFIG_TEST;
    const localRank = (id) => { const i = displayOrder.indexOf(id); return i === -1 ? 999 : i; };

    if (!settings || typeof settings !== "object") return fallback;
    const s = settings;
    const scoringSettings = s.scoringSettings;
    if (!scoringSettings) return fallback;
    const scoringItems = scoringSettings.scoringItems;
    if (!Array.isArray(scoringItems) || scoringItems.length === 0) return fallback;

    const scoringType = scoringSettings.scoringType ?? s.scoringType ?? "";
    const typeLower   = scoringType.toLowerCase();
    const isPoints    = typeLower.includes("point") && !typeLower.includes("categor");
    const isRoto      = typeLower.includes("roto") || typeLower.includes("rotisserie");

    if (isPoints) {
      const pointValues = {};
      const cats = [];
      for (const item of scoringItems) {
        const statId = typeof item.statId === "number" ? item.statId : parseInt(String(item.statId), 10);
        const pts    = typeof item.points === "number" ? item.points : 0;
        if (isNaN(statId) || pts === 0) continue;
        pointValues[statId] = pts;
        const cat = statMap[statId];
        if (cat) cats.push(cat);
      }
      if (cats.length === 0) return fallback;
      cats.sort((a, b) => localRank(a.espnStatId) - localRank(b.espnStatId));
      return { format: "points", cats, pointValues };
    }

    const cats = [];
    for (const item of scoringItems) {
      const statId = typeof item.statId === "number" ? item.statId : parseInt(String(item.statId), 10);
      if (isNaN(statId)) continue;
      const cat = statMap[statId];
      if (!cat) continue;
      const reverse = item.isReverseItem === true;
      cats.push(reverse !== cat.lowerIsBetter ? { ...cat, lowerIsBetter: reverse } : cat);
    }
    if (cats.length < 2) return fallback;
    cats.sort((a, b) => localRank(a.espnStatId) - localRank(b.espnStatId));
    return { format: isRoto ? "roto" : "categories", cats };
  }

  const nhlCfg = { statMap: NHL_STAT_MAP_TEST, statDisplayOrder: NHL_DISPLAY_ORDER_TEST, defaultScoringConfig: NHL_DEFAULT_TEST };

  // 18a — null settings → NHL default (not basketball default)
  {
    const r = parseLeagueScoringConfigWithSport(null, nhlCfg);
    assert(r.format === "categories", "NHL: null settings → NHL default (categories)");
    assert(r.cats.length === 10,      "NHL: null settings → 10-cat NHL default");
    assert(r.cats[0].id === "G",      "NHL default: first cat is G (skater first)");
  }

  // 18b — H2H categories with hockey stats; sorted by NHL_DISPLAY_ORDER (skaters before goalies)
  {
    const settings = {
      scoringSettings: {
        scoringType: "H2H_MOST_CATEGORIES",
        scoringItems: [
          { statId: 10, isReverseItem: true  }, // GAA  (goalie)
          { statId: 13, isReverseItem: false }, // G    (skater)
          { statId: 11, isReverseItem: false }, // SV%  (goalie)
          { statId: 29, isReverseItem: false }, // SOG  (skater)
        ],
      },
    };
    const r = parseLeagueScoringConfigWithSport(settings, nhlCfg);
    assert(r.format === "categories",             "NHL H2H: format=categories");
    assert(r.cats.length === 4,                   "NHL H2H: 4 cats parsed");
    assert(r.cats[0].id === "G",                  "NHL H2H: G first (skater, rank 0)");
    assert(r.cats[1].id === "SOG",                "NHL H2H: SOG second (skater, rank 4)");
    assert(r.cats[2].id === "GAA",                "NHL H2H: GAA third (goalie)");
    assert(r.cats[3].id === "SV%",                "NHL H2H: SV% last (goalie)");
    assert(r.cats.find(c => c.id==="GAA")?.lowerIsBetter === true,  "GAA: lowerIsBetter=true");
    assert(r.cats.find(c => c.id==="SV%")?.lowerIsBetter === false, "SV%: lowerIsBetter=false");
  }

  // 18c — Unknown hockey stat ID skipped; basketball stat IDs not in NHL map also skipped
  {
    const settings = {
      scoringSettings: {
        scoringType: "H2H_MOST_CATEGORIES",
        scoringItems: [
          { statId: 13, isReverseItem: false }, // G (hockey) — known
          { statId: 0,  isReverseItem: false }, // PTS (basketball) — NOT in NHL_STAT_MAP → skip
          { statId: 29, isReverseItem: false }, // SOG — known
        ],
      },
    };
    const r = parseLeagueScoringConfigWithSport(settings, nhlCfg);
    assert(r.cats.length === 2,                  "NHL: basketball stat (PTS/0) skipped — 2 cats");
    assert(!r.cats.find(c => c.id === "PTS"),    "NHL: no PTS in hockey parse result");
  }

  // 18d — Without cfg (basketball defaults used for basketball call)
  {
    const settings = {
      scoringSettings: {
        scoringType: "H2H_MOST_CATEGORIES",
        scoringItems: [
          { statId: 0,  isReverseItem: false }, // PTS (basketball)
          { statId: 6,  isReverseItem: false }, // REB
        ],
      },
    };
    const r = parseLeagueScoringConfigWithSport(settings, undefined);
    assert(r.cats.find(c => c.id === "PTS") !== undefined, "no cfg: basketball PTS parsed");
    assert(r.cats.find(c => c.id === "REB") !== undefined, "no cfg: basketball REB parsed");
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 19 — Hockey position building: active slot filter + F-suppression
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n─── Suite 19: Hockey position building ───");
{
  // Replicate the hockey position-building logic from hooks/usePlayers.ts
  const NHL_SLOT_POS = { 0: "C", 1: "LW", 2: "RW", 3: "F", 4: "D", 5: "G" };

  function buildHockeyPosition(eligibleSlots, activeSlotIds) {
    const activeSet = new Set(activeSlotIds);
    let mapped = eligibleSlots
      .filter(s => activeSet.has(s) && s in NHL_SLOT_POS)
      .map(s => [s, NHL_SLOT_POS[s]]);
    mapped.sort(([a], [b]) => a - b);
    // F-suppression: if player has any specific forward slot (C/LW/RW), hide generic F
    const SPECIFIC_FWD = new Set([0, 1, 2]);
    const hasSpecificFwd = mapped.some(([id]) => SPECIFIC_FWD.has(id));
    if (hasSpecificFwd) mapped = mapped.filter(([id]) => id !== 3);
    const seen = new Set();
    const allPos = [];
    for (const [, pos] of mapped) {
      if (!seen.has(pos)) { seen.add(pos); allPos.push(pos); }
    }
    return allPos.length > 0 ? allPos.join(", ") : "UT";
  }

  // All-positions league: slots {0(C), 1(LW), 2(RW), 3(F), 4(D), 5(G), 6(UTIL), 7(BN), 8(IR)}
  const ALL_SLOTS = [0, 1, 2, 3, 4, 5, 6, 7, 8];

  // 19a — Center (eligible [3,0,6,7,8]) in all-positions league: F suppressed → "C"
  assert(buildHockeyPosition([3,0,6,7,8], ALL_SLOTS) === "C",
    "all-pos league: center shows C (F suppressed)");

  // 19b — LW (eligible [3,1,6,7,8]) in all-positions league: F suppressed → "LW"
  assert(buildHockeyPosition([3,1,6,7,8], ALL_SLOTS) === "LW",
    "all-pos league: LW shows LW (F suppressed)");

  // 19c — RW (eligible [3,2,6,7,8]) in all-positions league: F suppressed → "RW"
  assert(buildHockeyPosition([3,2,6,7,8], ALL_SLOTS) === "RW",
    "all-pos league: RW shows RW (F suppressed)");

  // 19d — Player eligible LW+RW (e.g. Matt Boldy): eligible [3,1,2,6,7,8] → "LW, RW"
  assert(buildHockeyPosition([3,1,2,6,7,8], ALL_SLOTS) === "LW, RW",
    "all-pos league: LW+RW player shows 'LW, RW' (F suppressed)");

  // 19e — Defenseman (eligible [4,6,7,8]) in all-positions league: "D"
  assert(buildHockeyPosition([4,6,7,8], ALL_SLOTS) === "D",
    "all-pos league: D shows D");

  // 19f — Goalie (eligible [5,7,8]) in all-positions league: "G"
  assert(buildHockeyPosition([5,7,8], ALL_SLOTS) === "G",
    "all-pos league: G shows G");

  // F-only league: no C(0)/LW(1)/RW(2) slots — only {3(F), 4(D), 5(G), 7(BN), 8(IR)}
  const F_ONLY_SLOTS = [3, 4, 5, 7, 8];

  // 19g — Center in F-only league: slot 0 not active → F not suppressed → "F"
  assert(buildHockeyPosition([3,0,6,7,8], F_ONLY_SLOTS) === "F",
    "F-only league: center shows F");

  // 19h — LW in F-only league: slot 1 not active → F not suppressed → "F"
  assert(buildHockeyPosition([3,1,6,7,8], F_ONLY_SLOTS) === "F",
    "F-only league: LW shows F");

  // 19i — LW+RW eligible in F-only league: slots 1,2 not active → "F"
  assert(buildHockeyPosition([3,1,2,6,7,8], F_ONLY_SLOTS) === "F",
    "F-only league: LW+RW player shows F");

  // 19j — D in F-only league: unaffected → "D"
  assert(buildHockeyPosition([4,6,7,8], F_ONLY_SLOTS) === "D",
    "F-only league: D shows D");

  // 19k — G in F-only league: unaffected → "G"
  assert(buildHockeyPosition([5,7,8], F_ONLY_SLOTS) === "G",
    "F-only league: G shows G");

  // 19l — Slot ordering matches ESPN's canonical order (C=0 < LW=1 < RW=2 < F=3 < D=4 < G=5)
  // Player eligible for both D and G (unusual): should show "D, G"
  assert(buildHockeyPosition([4,5,7,8], ALL_SLOTS) === "D, G",
    "slot ordering: D (4) before G (5)");

  // 19m — UTIL (slot 6) excluded from NHL_SLOT_POS → never appears in position string
  assert(buildHockeyPosition([3,1,6,7,8], ALL_SLOTS) === "LW",
    "UTIL slot 6 excluded from position display");

  // 19n — No matching active slots → "UT" fallback
  const EMPTY_SLOTS = [7, 8]; // only BN and IR
  assert(buildHockeyPosition([3,1,6,7,8], EMPTY_SLOTS) === "UT",
    "no matching active slots → UT fallback");
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(52)}`);
console.log(`  ${passed+failed} tests   ${passed} passed   ${failed} failed`);
if (failed === 0) {
  console.log("  All tests passed ✓\n");
} else {
  console.log("  Some tests FAILED — see above ✗\n");
  process.exit(1);
}
