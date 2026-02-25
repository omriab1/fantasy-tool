/**
 * test-power.mjs  —  regression tests for all Power Rankings changes
 * Run with:  node test-power.mjs
 *
 * Covers:
 *   Suites 1-5  original round-robin / ranking / win% logic
 *   Suite 6     calcTradeScore sub-precision tiebreaker (AFG% / FT%)
 *   Suite 7     delta display strings  "> +.001" / "< -.001"
 *   Suite 8     fmt() edge cases relevant to the display
 *   Suite 9     row-collapse logic (any-row click always clears expansion)
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

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(52)}`);
console.log(`  ${passed+failed} tests   ${passed} passed   ${failed} failed`);
if (failed === 0) {
  console.log("  All tests passed ✓\n");
} else {
  console.log("  Some tests FAILED — see above ✗\n");
  process.exit(1);
}
