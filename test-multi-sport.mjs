/**
 * test-multi-sport.mjs — regression tests for multi-sport + WNBA changes
 * Run with:  node test-multi-sport.mjs
 *
 * Covers:
 *   Suite 16  WNBA position building — single G/F/C, no eligible-slot bleed
 *   Suite 17  NBA position building — multi-position still works (regression)
 *   Suite 18  getStatsWindowNote — off-season messages per window
 *   Suite 19  getStatsWindowNote — sports with no off-season return null
 *   Suite 20  apiSegment — urlSegment override (WNBA uses "wfba")
 *   Suite 21  IR slot IDs — NBA & WNBA both cover slot 13/20/21
 *   Suite 22  WNBA config structure — required fields present
 *   Suite 23  Trade page note logic — season banner vs no-players message
 *   Suite 24  Player cache key isolation — sport prefix prevents cross-sport hits
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

// ─── Replicated from lib/sports-config.ts ────────────────────────────────────

const WNBA_SLOT_POS = {};  // Empty: eligible slots don't add positions for WNBA

const WNBA_POS_MAP = {
  1: "G", 2: "F", 3: "C", 4: "G", 5: "F",  // G/F → G, F/C → F
};

const NBA_SLOT_POS = {
  0: "PG", 1: "SG", 2: "SF", 3: "PF", 4: "C",
};

const NBA_POS_MAP = {
  1: "PG", 2: "SG", 3: "SF", 4: "PF", 5: "C",
  6: "PG/SG", 7: "SG/SF", 8: "SF/PF", 9: "PF/C",
};

const WNBA_CONFIG = {
  sport: "wnba",
  name: "WNBA",
  emoji: "🏀",
  seasonYear: 2026,
  statsFallbackYear: 2025,
  urlSegment: "wfba",
  cdnLeague: "wnba",
  availableWindows: ["season", "30", "15", "7", "proj"],
  slotPosMap: WNBA_SLOT_POS,
  defaultPosMap: WNBA_POS_MAP,
  irSlotIds: [13, 20, 21],
};

const NBA_CONFIG = {
  sport: "fba",
  name: "NBA",
  emoji: "🏀",
  seasonYear: 2026,
  statsFallbackYear: undefined,
  cdnLeague: "nba",
  availableWindows: ["season", "30", "15", "7", "proj"],
  slotPosMap: NBA_SLOT_POS,
  defaultPosMap: NBA_POS_MAP,
  irSlotIds: [13, 20, 21],
};

/** Replicated position building logic from hooks/usePlayers.ts parsePlayerEntry */
function buildPosition(defaultPositionId, eligibleSlots, slotPosMap, defaultPosMap) {
  const defaultPosName = defaultPosMap[defaultPositionId] ?? null;
  const otherPos = [...new Set(
    eligibleSlots
      .filter((s) => s in slotPosMap && slotPosMap[s] !== defaultPosName)
      .map((s) => slotPosMap[s])
  )];
  const allPos = defaultPosName ? [defaultPosName, ...otherPos] : otherPos;
  return allPos.length > 0 ? allPos.join(", ") : "UT";
}

/** Replicated getStatsWindowNote from lib/sports-config.ts */
function getStatsWindowNote(cfg, window) {
  if (!cfg.statsFallbackYear || cfg.statsFallbackYear >= cfg.seasonYear) return null;
  if (window === "season") return `Showing ${cfg.statsFallbackYear} season stats — the ${cfg.name} ${cfg.seasonYear} season hasn't started yet`;
  if (window === "proj")   return `ESPN ${cfg.seasonYear} projections aren't available yet`;
  return `${window}-day stats aren't available yet — the ${cfg.name} ${cfg.seasonYear} season hasn't started`;
}

/** Replicated apiSegment from lib/sports-config.ts */
function apiSegment(cfg) {
  return cfg.urlSegment ?? cfg.sport;
}

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 16 — WNBA position building: single position only
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n─── Suite 16: WNBA position building — single G/F/C ───");
{
  // 16a — defaultPositionId=1 (G), eligibleSlots includes G slots → still just "G"
  //   Old bug: slot 5 ("G/F") would have been added → "G, G/F"
  const pos1 = buildPosition(1, [0, 1, 5, 11, 12], WNBA_SLOT_POS, WNBA_POS_MAP);
  assert(pos1 === "G", "WNBA defaultPosId=1, eligible [0,1,5,11,12] → 'G' (not 'G, G/F')");

  // 16b — defaultPositionId=2 (F)
  const pos2 = buildPosition(2, [2, 3, 5, 11, 12], WNBA_SLOT_POS, WNBA_POS_MAP);
  assert(pos2 === "F", "WNBA defaultPosId=2 → 'F'");

  // 16c — defaultPositionId=3 (C)
  const pos3 = buildPosition(3, [4, 11, 12], WNBA_SLOT_POS, WNBA_POS_MAP);
  assert(pos3 === "C", "WNBA defaultPosId=3 → 'C'");

  // 16d — defaultPositionId=4 (was "G/F", now simplified to "G")
  const pos4 = buildPosition(4, [0, 1, 2, 11, 12], WNBA_SLOT_POS, WNBA_POS_MAP);
  assert(pos4 === "G", "WNBA defaultPosId=4 → 'G' (simplified from G/F)");

  // 16e — defaultPositionId=5 (was "F/C", now simplified to "F")
  const pos5 = buildPosition(5, [2, 3, 4, 11, 12], WNBA_SLOT_POS, WNBA_POS_MAP);
  assert(pos5 === "F", "WNBA defaultPosId=5 → 'F' (simplified from F/C)");

  // 16f — No eligible slots → position from defaultPosMap only
  const posNoSlots = buildPosition(1, [], WNBA_SLOT_POS, WNBA_POS_MAP);
  assert(posNoSlots === "G", "WNBA no eligible slots → still 'G' from defaultPosMap");

  // 16g — Unknown defaultPositionId and empty slotPosMap → "UT" fallback
  const posUnknown = buildPosition(99, [11, 12], WNBA_SLOT_POS, WNBA_POS_MAP);
  assert(posUnknown === "UT", "WNBA unknown posId + empty slotPosMap → 'UT'");

  // 16h — All WNBA known positions are single words (no slash)
  for (const [id, pos] of Object.entries(WNBA_POS_MAP)) {
    assert(!pos.includes("/"), `WNBA_POS_MAP[${id}]="${pos}" has no slash (single position)`);
  }

  // 16i — WNBA_SLOT_POS is empty (no entries)
  assert(Object.keys(WNBA_SLOT_POS).length === 0, "WNBA_SLOT_POS is empty");
}

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 17 — NBA position building: multi-position still works (regression)
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n─── Suite 17: NBA position building — regression check ───");
{
  // 17a — PG-only (slot 0 = PG, defaultId=1)
  const pos1 = buildPosition(1, [0, 11, 12], NBA_SLOT_POS, NBA_POS_MAP);
  assert(pos1 === "PG", "NBA PG-only player → 'PG'");

  // 17b — SG/SF (default=SG, eligible includes SF slot)
  const pos2 = buildPosition(2, [1, 2, 11, 12], NBA_SLOT_POS, NBA_POS_MAP);
  assert(pos2 === "SG, SF", "NBA SG/SF eligible → 'SG, SF'");

  // 17c — PF/C combo (default=PF, eligible includes C slot)
  const pos3 = buildPosition(4, [3, 4, 11, 12], NBA_SLOT_POS, NBA_POS_MAP);
  assert(pos3 === "PF, C", "NBA PF/C → 'PF, C'");

  // 17d — Multi-position defaultPosMap (e.g. PG/SG)
  const pos4 = buildPosition(6, [0, 1, 11, 12], NBA_SLOT_POS, NBA_POS_MAP);
  // defaultPosName = "PG/SG"; slots 0="PG" and 1="SG" both differ from "PG/SG"
  assert(pos4 === "PG/SG, PG, SG" || pos4.startsWith("PG/SG"), "NBA PG/SG defaultPosMap works");

  // 17e — Unknown position ID → no default, eligible slots only
  const pos5 = buildPosition(99, [0, 11, 12], NBA_SLOT_POS, NBA_POS_MAP);
  // defaultPosName=null, eligible slot 0="PG" → just ["PG"]
  assert(pos5 === "PG", "NBA unknown defaultPosId, eligible has PG → 'PG'");

  // 17f — No eligible slots and unknown default → "UT"
  const pos6 = buildPosition(99, [], NBA_SLOT_POS, NBA_POS_MAP);
  assert(pos6 === "UT", "NBA unknown posId + no eligible → 'UT'");

  // 17g — Deduplication: same position from multiple eligible slots
  const pos7 = buildPosition(1, [0, 0, 11, 12], NBA_SLOT_POS, NBA_POS_MAP);
  // slot 0 appears twice but dedup via Set → just "PG"
  assert(pos7 === "PG", "NBA duplicate eligible slot deduplicated");

  // 17h — NBA has multiple position values (multi-pos system still intact)
  assert(Object.keys(NBA_SLOT_POS).length > 0,   "NBA_SLOT_POS is non-empty");
  assert(Object.keys(NBA_POS_MAP).length >= 5,    "NBA_POS_MAP has ≥5 entries");
}

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 18 — getStatsWindowNote: WNBA off-season messages
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n─── Suite 18: getStatsWindowNote — WNBA off-season ───");
{
  // 18a — Season window: "Showing 2025 season stats…"
  const noteS = getStatsWindowNote(WNBA_CONFIG, "season");
  assert(noteS !== null,                          "WNBA season window: note is not null");
  assert(noteS.includes("2025"),                  "WNBA season note mentions 2025");
  assert(noteS.includes("2026"),                  "WNBA season note mentions 2026");
  assert(noteS.includes("WNBA"),                  "WNBA season note mentions WNBA");
  assert(noteS.startsWith("Showing"),             "WNBA season note starts with 'Showing'");
  assert(!noteS.includes("aren't available"),     "WNBA season note doesn't say 'aren't available'");

  // 18b — 30-day window
  const note30 = getStatsWindowNote(WNBA_CONFIG, "30");
  assert(note30 !== null,                         "WNBA 30d window: note is not null");
  assert(note30.includes("30-day"),               "WNBA 30d note says '30-day'");
  assert(note30.includes("aren't available"),     "WNBA 30d note says 'aren't available'");
  assert(note30.includes("2026"),                 "WNBA 30d note mentions season year");
  assert(note30.includes("WNBA"),                 "WNBA 30d note mentions sport name");

  // 18c — 15-day window
  const note15 = getStatsWindowNote(WNBA_CONFIG, "15");
  assert(note15 !== null,                         "WNBA 15d: note is not null");
  assert(note15.includes("15-day"),               "WNBA 15d note says '15-day'");

  // 18d — 7-day window
  const note7 = getStatsWindowNote(WNBA_CONFIG, "7");
  assert(note7 !== null,                          "WNBA 7d: note is not null");
  assert(note7.includes("7-day"),                 "WNBA 7d note says '7-day'");

  // 18e — proj window: projections message
  const noteP = getStatsWindowNote(WNBA_CONFIG, "proj");
  assert(noteP !== null,                          "WNBA proj: note is not null");
  assert(noteP.includes("projections"),           "WNBA proj note mentions 'projections'");
  assert(noteP.includes("2026"),                  "WNBA proj note mentions 2026");
  assert(!noteP.includes("-day"),                 "WNBA proj note doesn't say 'N-day'");

  // 18f — Season note and non-season notes are different
  assert(noteS !== note30,  "season note differs from 30d note");
  assert(noteS !== noteP,   "season note differs from proj note");
  assert(note30 !== noteP,  "30d note differs from proj note");

  // 18g — Old short messages are NOT returned
  assert(noteS !== "Using 2025 stats",          "season: not old short message");
  assert(note30 !== "Stats not available yet",  "30d: not old short message");
}

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 19 — getStatsWindowNote: in-season sports return null
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n─── Suite 19: getStatsWindowNote — in-season sports ───");
{
  // 19a — NBA has no statsFallbackYear → all windows return null
  for (const w of ["season", "30", "15", "7", "proj"]) {
    const note = getStatsWindowNote(NBA_CONFIG, w);
    assert(note === null, `NBA ${w} window → null (no off-season message)`);
  }

  // 19b — statsFallbackYear equal to seasonYear → treat as in-season (null)
  const cfgSame = { name: "Test", seasonYear: 2026, statsFallbackYear: 2026 };
  assert(getStatsWindowNote(cfgSame, "season") === null,
    "statsFallbackYear === seasonYear → null (no off-season)");

  // 19c — statsFallbackYear greater than seasonYear → null (impossible but defensive)
  const cfgFuture = { name: "Test", seasonYear: 2025, statsFallbackYear: 2026 };
  assert(getStatsWindowNote(cfgFuture, "season") === null,
    "statsFallbackYear > seasonYear → null");

  // 19d — No statsFallbackYear field → null
  const cfgNone = { name: "NBA", seasonYear: 2026 };
  assert(getStatsWindowNote(cfgNone, "30") === null,
    "missing statsFallbackYear → null");
}

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 20 — apiSegment: urlSegment override
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n─── Suite 20: apiSegment — urlSegment override ───");
{
  // 20a — WNBA uses "wfba" (not "wnba") in URL
  assert(apiSegment(WNBA_CONFIG) === "wfba",
    "WNBA apiSegment → 'wfba' (urlSegment override, not sport code)");

  // 20b — NBA has no urlSegment → falls back to sport code "fba"
  assert(apiSegment(NBA_CONFIG) === "fba",
    "NBA apiSegment → 'fba' (no urlSegment, uses sport code)");

  // 20c — Generic: urlSegment takes precedence over sport code
  const cfgOverride = { sport: "xyz", urlSegment: "abc" };
  assert(apiSegment(cfgOverride) === "abc",
    "urlSegment 'abc' overrides sport 'xyz'");

  // 20d — Generic: no urlSegment falls back to sport
  const cfgNoOverride = { sport: "flb" };
  assert(apiSegment(cfgNoOverride) === "flb",
    "no urlSegment → sport code 'flb'");

  // 20e — urlSegment=undefined explicitly → still falls back to sport
  const cfgUndefined = { sport: "fhl", urlSegment: undefined };
  assert(apiSegment(cfgUndefined) === "fhl",
    "urlSegment=undefined → sport code 'fhl'");

  // 20f — WNBA sport code "wnba" is NOT the API segment — confirm they differ
  assert(WNBA_CONFIG.sport !== apiSegment(WNBA_CONFIG),
    "WNBA sport code ('wnba') differs from apiSegment ('wfba')");

  // 20g — CDN league code (for images) is "wnba" — separate from URL segment
  assert(WNBA_CONFIG.cdnLeague === "wnba",
    "WNBA cdnLeague is 'wnba' (ESPN CDN uses this for headshots)");
  assert(apiSegment(WNBA_CONFIG) !== WNBA_CONFIG.cdnLeague,
    "WNBA apiSegment differs from cdnLeague");
}

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 21 — IR slot IDs: covers user's slot 13 discovery
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n─── Suite 21: IR slot IDs ───");
{
  // 21a — Both NBA and WNBA include slot 13 (user's IL slot)
  assert(NBA_CONFIG.irSlotIds.includes(13),   "NBA irSlotIds includes slot 13");
  assert(WNBA_CONFIG.irSlotIds.includes(13),  "WNBA irSlotIds includes slot 13");

  // 21b — Standard ESPN IL slots also covered
  assert(NBA_CONFIG.irSlotIds.includes(20),   "NBA irSlotIds includes slot 20 (standard IL)");
  assert(NBA_CONFIG.irSlotIds.includes(21),   "NBA irSlotIds includes slot 21 (IL+)");
  assert(WNBA_CONFIG.irSlotIds.includes(20),  "WNBA irSlotIds includes slot 20");
  assert(WNBA_CONFIG.irSlotIds.includes(21),  "WNBA irSlotIds includes slot 21");

  // 21c — IR filter logic: players in IR slots are excluded
  //   Replicated from hooks/useLeague.ts two-pass filter
  function filterIRPlayers(rosterEntries, irSlotIds) {
    const irSet = new Set();
    for (const entry of rosterEntries) {
      if (irSlotIds.includes(entry.lineupSlotId)) {
        irSet.add(entry.playerId);
      }
    }
    const active = [];
    for (const entry of rosterEntries) {
      if (!irSet.has(entry.playerId)) {
        active.push(entry.playerId);
      }
    }
    return { irSet, active };
  }

  // 21d — Slot 13 correctly excludes a player from active roster
  const roster13 = [
    { playerId: 1, lineupSlotId: 0 },  // PG — active
    { playerId: 2, lineupSlotId: 13 }, // IL slot → excluded
    { playerId: 3, lineupSlotId: 12 }, // Bench — active
    { playerId: 4, lineupSlotId: 20 }, // IL → excluded
  ];
  const { irSet: irSet13, active: active13 } = filterIRPlayers(roster13, [13, 20, 21]);
  assert(irSet13.has(2),               "slot 13 player excluded from active roster");
  assert(irSet13.has(4),               "slot 20 player excluded from active roster");
  assert(active13.includes(1),         "PG slot (0) player remains active");
  assert(active13.includes(3),         "bench slot (12) player remains active");
  assert(!active13.includes(2),        "slot 13 player not in active list");
  assert(!active13.includes(4),        "slot 20 player not in active list");
  assert(active13.length === 2,        "2 active players out of 4");

  // 21e — No IR players → all remain active
  const rosterNoIR = [
    { playerId: 1, lineupSlotId: 0 },
    { playerId: 2, lineupSlotId: 1 },
    { playerId: 3, lineupSlotId: 12 },
  ];
  const { irSet: irSetNone, active: activeNone } = filterIRPlayers(rosterNoIR, [13, 20, 21]);
  assert(irSetNone.size === 0,         "no IR players → irSet empty");
  assert(activeNone.length === 3,      "no IR players → all 3 remain active");

  // 21f — All IR → active list empty
  const rosterAllIR = [
    { playerId: 1, lineupSlotId: 13 },
    { playerId: 2, lineupSlotId: 20 },
    { playerId: 3, lineupSlotId: 21 },
  ];
  const { active: activeAll } = filterIRPlayers(rosterAllIR, [13, 20, 21]);
  assert(activeAll.length === 0,       "all IR players → empty active list");
}

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 22 — WNBA config structure: required fields
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n─── Suite 22: WNBA config structure ───");
{
  assert(WNBA_CONFIG.sport    === "wnba",  "WNBA sport code is 'wnba'");
  assert(WNBA_CONFIG.name     === "WNBA",  "WNBA name is 'WNBA'");
  assert(WNBA_CONFIG.emoji    === "🏀",    "WNBA emoji is 🏀");
  assert(WNBA_CONFIG.seasonYear === 2026,  "WNBA seasonYear is 2026");
  assert(WNBA_CONFIG.statsFallbackYear === 2025, "WNBA statsFallbackYear is 2025");
  assert(WNBA_CONFIG.urlSegment === "wfba","WNBA urlSegment is 'wfba'");
  assert(WNBA_CONFIG.cdnLeague  === "wnba","WNBA cdnLeague is 'wnba'");
  assert(Array.isArray(WNBA_CONFIG.availableWindows), "availableWindows is an array");
  assert(WNBA_CONFIG.availableWindows.includes("season"), "WNBA has 'season' window");
  assert(WNBA_CONFIG.availableWindows.includes("30"),     "WNBA has '30' window");
  assert(typeof WNBA_CONFIG.slotPosMap    === "object",  "slotPosMap is an object");
  assert(typeof WNBA_CONFIG.defaultPosMap === "object",  "defaultPosMap is an object");
  assert(Array.isArray(WNBA_CONFIG.irSlotIds),           "irSlotIds is an array");

  // Confirm statsFallbackYear < seasonYear (off-season condition)
  assert(WNBA_CONFIG.statsFallbackYear < WNBA_CONFIG.seasonYear,
    "statsFallbackYear (2025) < seasonYear (2026) → off-season logic active");

  // All WNBA windows have notes when in off-season
  for (const w of WNBA_CONFIG.availableWindows) {
    assert(getStatsWindowNote(WNBA_CONFIG, w) !== null,
      `WNBA window '${w}' returns a note in off-season`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 23 — Trade page note display logic
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n─── Suite 23: Trade page note display logic ───");
{
  // Simulates the logic in trade/page.tsx for showing notes

  /** Returns what the trade page shows for a given state */
  function tradePageState(cfg, statsWindow, playersLoaded, loading, noSettings, error) {
    const windowNote = getStatsWindowNote(cfg, statsWindow);

    if (loading)    return "loading";
    if (noSettings) return "noSettings";
    if (error)      return "error";

    if (playersLoaded) {
      // Amber banner shown when players loaded with fallback-year note (season window)
      const banner = windowNote ? `banner:${windowNote}` : null;
      return { state: "playersLoaded", banner };
    }

    // No players
    if (windowNote) return { state: "noPlayers", msg: windowNote, style: "amber" };
    return { state: "noPlayers", msg: "No players loaded. Check your settings or retry.", style: "gray" };
  }

  // 23a — WNBA season window: players load, banner shown
  const s1 = tradePageState(WNBA_CONFIG, "season", true, false, false, null);
  assert(s1.state === "playersLoaded",    "WNBA season: state=playersLoaded");
  assert(s1.banner !== null,              "WNBA season: amber banner present");
  assert(s1.banner.includes("2025"),      "WNBA season: banner mentions 2025");

  // 23b — WNBA 30d window: no players, shows specific amber note
  const s2 = tradePageState(WNBA_CONFIG, "30", false, false, false, null);
  assert(s2.state === "noPlayers",        "WNBA 30d: state=noPlayers");
  assert(s2.style === "amber",            "WNBA 30d: amber style (specific note)");
  assert(s2.msg.includes("30-day"),       "WNBA 30d: message says '30-day'");
  assert(!s2.msg.includes("Check your settings"), "WNBA 30d: NOT generic error message");

  // 23c — WNBA proj window: ESPN projections note
  const s3 = tradePageState(WNBA_CONFIG, "proj", false, false, false, null);
  assert(s3.style === "amber",            "WNBA proj: amber style");
  assert(s3.msg.includes("projections"), "WNBA proj: mentions 'projections'");

  // 23d — NBA 30d window: no players, shows generic message (no off-season note)
  const s4 = tradePageState(NBA_CONFIG, "30", false, false, false, null);
  assert(s4.state === "noPlayers",        "NBA 30d: state=noPlayers");
  assert(s4.style === "gray",             "NBA 30d: gray style (generic message)");
  assert(s4.msg.includes("Check your settings"), "NBA 30d: generic error message shown");

  // 23e — NBA season window: players load, no banner
  const s5 = tradePageState(NBA_CONFIG, "season", true, false, false, null);
  assert(s5.state === "playersLoaded",    "NBA season: state=playersLoaded");
  assert(s5.banner === null,              "NBA season: no banner (in-season sport)");

  // 23f — Loading state takes priority over everything
  const s6 = tradePageState(WNBA_CONFIG, "30", false, true, false, null);
  assert(s6 === "loading",               "loading=true → loading state");

  // 23g — noSettings takes priority over note logic
  const s7 = tradePageState(WNBA_CONFIG, "30", false, false, true, null);
  assert(s7 === "noSettings",            "noSettings=true → noSettings state");

  // 23h — Error takes priority over note logic
  const s8 = tradePageState(WNBA_CONFIG, "30", false, false, false, "some error");
  assert(s8 === "error",                 "error present → error state");

  // 23i — WNBA season window: banner text matches exactly the note function
  const s9 = tradePageState(WNBA_CONFIG, "season", true, false, false, null);
  const expectedNote = getStatsWindowNote(WNBA_CONFIG, "season");
  assert(s9.banner === `banner:${expectedNote}`, "season banner text matches getStatsWindowNote");
}

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 24 — Player cache key isolation
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n─── Suite 24: Player cache key isolation ───");
{
  /** Replicated cacheKey from lib/espn-cache.ts */
  function cacheKey(...parts) {
    return parts.join("|");
  }

  const leagueId = "12345";

  // 24a — Same league, different sports → different cache keys
  const keyNBA  = cacheKey("players_v6", leagueId, `fba_season`);
  const keyWNBA = cacheKey("players_v6", leagueId, `wnba_season`);
  assert(keyNBA !== keyWNBA, "NBA and WNBA season keys differ");

  // 24b — Same sport, different windows → different keys
  const keyS  = cacheKey("players_v6", leagueId, `fba_season`);
  const key30 = cacheKey("players_v6", leagueId, `fba_30`);
  assert(keyS !== key30, "season and 30d keys differ for same sport");

  // 24c — Cache version bump: v6 key differs from v5
  const keyV5 = cacheKey("players_v5", leagueId, `fba_season`);
  const keyV6 = cacheKey("players_v6", leagueId, `fba_season`);
  assert(keyV5 !== keyV6, "players_v5 and players_v6 cache keys differ (forces re-fetch)");

  // 24d — Different league IDs → different keys
  const key1 = cacheKey("players_v6", "11111", `fba_season`);
  const key2 = cacheKey("players_v6", "22222", `fba_season`);
  assert(key1 !== key2, "different leagueIds → different cache keys");

  // 24e — All WNBA windows have unique cache keys
  const wnbaWindows = ["season", "30", "15", "7", "proj"];
  const wnbaKeys = wnbaWindows.map((w) => cacheKey("players_v6", leagueId, `wnba_${w}`));
  const uniqueWnbaKeys = new Set(wnbaKeys);
  assert(uniqueWnbaKeys.size === wnbaWindows.length, "all WNBA window cache keys are unique");

  // 24f — WNBA and NBA keys don't collide even for same window
  for (const w of ["season", "30", "15", "7", "proj"]) {
    const kNBA  = cacheKey("players_v6", leagueId, `fba_${w}`);
    const kWNBA = cacheKey("players_v6", leagueId, `wnba_${w}`);
    assert(kNBA !== kWNBA, `NBA vs WNBA cache key for '${w}' window don't collide`);
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(52)}`);
console.log(`  ${passed + failed} tests   ${passed} passed   ${failed} failed`);
if (failed === 0) {
  console.log("  All tests passed ✓\n");
} else {
  console.log("  Some tests FAILED — see above ✗\n");
  process.exit(1);
}
