/**
 * ESPN Matchup Planner endpoint.
 *
 * GET /api/espn/matchup?leagueId={id}&sport={sport}&period={n}
 *
 * Headers: x-espn-s2, x-espn-swid
 *
 * Returns everything the Matchup Planner page needs:
 *  - My team and opponent identity + names
 *  - Matching period ID (current matchup week, or specified period)
 *  - totalMatchupPeriods — total seasons matchup periods count (for the period selector)
 *  - Per-NBA-team game counts: total and remaining in the requested matchup week
 *  - Current cumulative stats for both teams (scoreByStat)
 *  - Fresh roster map (rosterByTeamId) for the Matchup page to bypass stale localStorage cache
 *
 * Game count strategy:
 *  ESPN's proTeamSchedules view is no longer reliably returned by the ESPN Fantasy API.
 *  Instead we use the public ESPN NBA scoreboard (no auth) for each day of the matchup
 *  week, then map team abbreviations → ESPN Fantasy proTeamId via NBA_ABBREV_TO_ESPN_ID.
 *
 *  numWeeks per matchup is read from settings.scheduleSettings.matchupPeriods[periodId].length.
 *  For a 2-week matchup (numWeeks=2) the window spans 14 days.
 *  The date range for past periods is computed by offsetting from the current Monday.
 */

import { NextRequest, NextResponse } from "next/server";
import { SPORT_CONFIGS, apiBase, apiSegment } from "@/lib/sports-config";
import { extractGuid } from "@/lib/swid-parser";
import { NBA_ABBREV_TO_ESPN_ID } from "@/lib/nba-schedule";
import type { EspnSport } from "@/lib/types";
import type { MatchupApiResponse } from "@/lib/matchup-calculator";

// ─── ESPN Fantasy fetch helper ────────────────────────────────────────────────

async function espnFetch(url: string, espnS2: string, swid: string) {
  return fetch(url, {
    headers: {
      Cookie: `espn_s2=${espnS2}; SWID=${swid}`,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "application/json",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://fantasy.espn.com/",
      "Origin": "https://fantasy.espn.com",
      "x-fantasy-source": "kona",
      "x-fantasy-platform": "kona-PROD-2.7.0-rc-14-p2",
    },
    cache: "no-store",
  });
}

// ─── Public ESPN NBA scoreboard (no auth) ─────────────────────────────────────

type EspnEvent = {
  id?: string;
  date?: string;
  competitions?: Array<{
    competitors?: Array<{ team?: { abbreviation?: string } }>;
  }>;
};

function parseAbbrevs(events: unknown[]): string[] {
  const abbrevs: string[] = [];
  for (const ev of events) {
    const event = ev as EspnEvent;
    for (const comp of event.competitions ?? []) {
      for (const competitor of comp.competitors ?? []) {
        if (competitor.team?.abbreviation) abbrevs.push(competitor.team.abbreviation.toUpperCase());
      }
    }
  }
  return abbrevs;
}

/**
 * Fetch NBA game abbreviations + event IDs for all dates in the matchup week.
 * Tries a single range request first (more reliable). Falls back to per-day parallel requests.
 * Returns:
 *   scheduleByDate: YYYYMMDD → team abbreviations that play on that date
 *   gamesByTeamAndDate: YYYYMMDD → { proTeamId (string) → gameId }
 *
 * IMPORTANT: gamesByTeamAndDate is keyed by proTeamId string (not team abbreviation).
 * This avoids mismatches between ESPN scoreboard short-forms ("GS", "NO", "PHO")
 * and the long-forms in NBA_ABBREV_TO_ESPN_ID ("GSW", "NOP", "PHX").
 * Both "GS" and "GSW" map to proTeamId 9; using the numeric key eliminates ambiguity.
 */
async function fetchNbaScheduleForWeek(dates: Date[]): Promise<{
  scheduleByDate: Map<string, string[]>;
  gamesByTeamAndDate: Map<string, Map<string, string>>;
}> {
  const startStr = dateToYYYYMMDD(dates[0]);
  const endStr = dateToYYYYMMDD(dates[dates.length - 1]);

  /** Helper: given a raw team abbreviation, return String(proTeamId) or null. */
  function abbrevToProTeamStr(abbrev: string): string | null {
    const id = NBA_ABBREV_TO_ESPN_ID[abbrev];
    return id !== undefined ? String(id) : null;
  }

  // Attempt 1: single range request — one ESPN call for the full week
  try {
    const rangeUrl = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${startStr}-${endStr}&limit=200`;
    const res = await fetch(rangeUrl, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json() as { events?: unknown[] };
      const events = data.events ?? [];
      if (events.length > 0) {
        const scheduleByDate = new Map<string, string[]>();
        const gamesByTeamAndDate = new Map<string, Map<string, string>>();
        for (const d of dates) {
          const key = dateToYYYYMMDD(d);
          scheduleByDate.set(key, []);
          gamesByTeamAndDate.set(key, new Map());
        }
        for (const ev of events) {
          const event = ev as EspnEvent;
          const dateKey = event.date ? eventDateToGameDate(event.date) : null;
          if (!dateKey || !scheduleByDate.has(dateKey)) continue;
          const gameId = event.id;
          const comps = event.competitions ?? [];
          for (const comp of comps) {
            for (const competitor of comp.competitors ?? []) {
              const abbrev = competitor.team?.abbreviation?.toUpperCase();
              if (!abbrev) continue;
              scheduleByDate.get(dateKey)!.push(abbrev);
              if (gameId) {
                const proTeamStr = abbrevToProTeamStr(abbrev);
                if (proTeamStr) gamesByTeamAndDate.get(dateKey)!.set(proTeamStr, gameId);
              }
            }
          }
        }
        return { scheduleByDate, gamesByTeamAndDate };
      }
    }
  } catch { /* fall through to per-day */ }

  // Attempt 2: individual per-day requests with retry
  const scheduleByDate = new Map<string, string[]>();
  const gamesByTeamAndDate = new Map<string, Map<string, string>>();
  for (const d of dates) {
    const key = dateToYYYYMMDD(d);
    scheduleByDate.set(key, []);
    gamesByTeamAndDate.set(key, new Map());
  }

  const results = await Promise.all(
    dates.map(async (date) => {
      const dateStr = dateToYYYYMMDD(date);
      const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateStr}`;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 300 * attempt));
        try {
          const res = await fetch(url, { cache: "no-store" });
          if (!res.ok) continue;
          const data = await res.json() as { events?: unknown[] };
          const abbrevs: string[] = [];
          const teamToGame = new Map<string, string>();
          for (const ev of (data.events ?? [])) {
            const event = ev as EspnEvent;
            const gameId = event.id;
            for (const comp of event.competitions ?? []) {
              for (const competitor of comp.competitors ?? []) {
                const abbrev = competitor.team?.abbreviation?.toUpperCase();
                if (!abbrev) continue;
                abbrevs.push(abbrev);
                if (gameId) {
                  const proTeamStr = abbrevToProTeamStr(abbrev);
                  if (proTeamStr) teamToGame.set(proTeamStr, gameId);
                }
              }
            }
          }
          return { dateStr, abbrevs, teamToGame };
        } catch { /* retry */ }
      }
      return { dateStr, abbrevs: [], teamToGame: new Map<string, string>() };
    }),
  );

  for (const { dateStr, abbrevs, teamToGame } of results) {
    scheduleByDate.set(dateStr, abbrevs);
    gamesByTeamAndDate.set(dateStr, teamToGame);
  }
  return { scheduleByDate, gamesByTeamAndDate };
}

function dateToYYYYMMDD(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

/**
 * Convert an ESPN event ISO timestamp to the US game date (YYYYMMDD).
 *
 * NBA games span roughly 5 pm – 3:30 am UTC (noon ET – 11:30 pm ET).
 * Events whose UTC timestamp falls after midnight but before 10 am UTC are
 * late-night US games that belong to the PREVIOUS US calendar date.
 *
 * Without this correction, a 10:30 pm ET Sunday game stored as 2:30 am UTC
 * Monday would be attributed to Monday, causing it to fall outside the
 * matchup-week window (Mon–Sun of the prior week), making that team appear
 * to have one fewer game than it actually played.
 */
function eventDateToGameDate(isoDate: string): string {
  const dt = new Date(isoDate);
  if (dt.getUTCHours() < 10) {
    dt.setUTCDate(dt.getUTCDate() - 1);
  }
  return dt.toISOString().slice(0, 10).replace(/-/g, "");
}

/**
 * Compute the dates for a given matchup period.
 *
 * @param currentMatchupPeriod  The current active matchup period (from ESPN API)
 * @param resolvedPeriod        The period the user wants to view
 * @param numWeeks              Calendar weeks this matchup spans (from settingsPeriodIds.length)
 */
function getMatchupDates(
  currentMatchupPeriod: number,
  resolvedPeriod: number,
  numWeeks: number,
): Date[] {
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  const dayOfWeek = now.getUTCDay(); // 0=Sun
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const currentMondayMs = now.getTime() - daysFromMonday * 86_400_000;

  // How many matchup periods back from the current one
  const periodOffset = currentMatchupPeriod - resolvedPeriod;

  // Start Monday of the requested period:
  //   current monday minus (periodOffset * numWeeks + numWeeks - 1) weeks
  const startMs = currentMondayMs - (periodOffset * numWeeks + numWeeks - 1) * 7 * 86_400_000;

  return Array.from({ length: numWeeks * 7 }, (_, i) => new Date(startMs + i * 86_400_000));
}


// ─── Types ────────────────────────────────────────────────────────────────────

type RosterEntryRaw = {
  playerId?: number;
  lineupSlotId?: number;
  playerPoolEntry?: {
    id?: number;
    player?: {
      id?: number;
      fullName?: string;
      proTeamId?: number;
    };
  };
};

type RawTeam = {
  id: number;
  name?: string;
  location?: string;
  nickname?: string;
  abbrev?: string;
  primaryOwner?: string;
  owners?: string[];
  /** Populated by mRoster view */
  roster?: { entries?: RosterEntryRaw[] };
};

type ScoreByStat = Record<string, { score: number }>;

type RawMatchupSide = {
  teamId: number;
  cumulativeScore?: { scoreByStat?: ScoreByStat };
};

type RawScheduleEntry = {
  matchupPeriodId: number;
  home: RawMatchupSide;
  away?: RawMatchupSide;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractTeamName(t: RawTeam): string {
  return (
    t.name ||
    `${t.location ?? ""} ${t.nickname ?? ""}`.trim() ||
    t.abbrev ||
    `Team ${t.id}`
  );
}

function swidMatchOwner(swid: string, ownerId: string): boolean {
  return extractGuid(swid) === (ownerId ?? "").replace(/[{}]/g, "").toLowerCase();
}

function scoreByStatToRecord(sbs: ScoreByStat | undefined): Record<string, number> {
  if (!sbs) return {};
  const result: Record<string, number> = {};
  for (const [k, v] of Object.entries(sbs)) {
    result[k] = v.score;
  }
  return result;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const leagueId = searchParams.get("leagueId");
  const sport = (searchParams.get("sport") ?? "fba") as EspnSport;
  const periodParam = searchParams.get("period");

  if (!leagueId) {
    return NextResponse.json({ error: "Missing leagueId" }, { status: 400 });
  }

  const cfg = SPORT_CONFIGS[sport] ?? SPORT_CONFIGS.fba;
  const espnS2 = req.headers.get("x-espn-s2") ?? "";
  const swid = req.headers.get("x-espn-swid") ?? "";

  if (!espnS2 || !swid) {
    return NextResponse.json({ error: "Missing ESPN credentials" }, { status: 401 });
  }

  const base = `${apiBase(cfg)}/games/${apiSegment(cfg)}/seasons/${cfg.seasonYear}/segments/0/leagues`;

  // ── Step 1: League data (teams + status + settings) ──────────────────────
  const leagueUrl =
    `${base}/${leagueId}?view=mTeam&view=mSettings&view=mStatus&view=mRoster`;

  let leagueData: Record<string, unknown>;
  try {
    const res = await espnFetch(leagueUrl, espnS2, swid);
    if (!res.ok) {
      const text = await res.text();
      if (res.status === 401 || res.status === 403) {
        return NextResponse.json(
          { error: "Credentials rejected by ESPN. Try refreshing your espn_s2 cookie." },
          { status: res.status },
        );
      }
      return NextResponse.json(
        { error: `ESPN returned ${res.status}`, detail: text.slice(0, 200) },
        { status: res.status },
      );
    }
    leagueData = await res.json();
  } catch (err) {
    return NextResponse.json({ error: "Network error reaching ESPN", detail: String(err) }, { status: 502 });
  }

  const status = leagueData.status as Record<string, unknown> | undefined;
  const currentMatchupPeriod =
    (status?.currentMatchupPeriod as number) ??
    (leagueData.scoringPeriodId as number) ??
    1;
  const currentScoringPeriodId =
    (leagueData.scoringPeriodId as number) ??
    currentMatchupPeriod;

  if (currentMatchupPeriod === 0) {
    return NextResponse.json({ error: "No active matchup period (off-season)." }, { status: 422 });
  }

  // Parse period selector — default to current if not provided or out of range
  const requestedPeriod = periodParam ? parseInt(periodParam, 10) : currentMatchupPeriod;
  const resolvedPeriod = isNaN(requestedPeriod) || requestedPeriod < 1
    ? currentMatchupPeriod
    : requestedPeriod;

  // ── Parse schedule settings ─────────────────────────────────────────────
  const settings = leagueData.settings as Record<string, unknown> | undefined;
  const scheduleSettings = settings?.scheduleSettings as Record<string, unknown> | undefined;
  const matchupPeriods = scheduleSettings?.matchupPeriods as Record<string, unknown> | undefined ?? {};

  // totalMatchupPeriods: number of matchup periods in this season
  const totalMatchupPeriods = Math.max(
    Object.keys(matchupPeriods).length,
    currentMatchupPeriod,
  );

  // numWeeks resolved after finding myMatchup (needs actual matchupPeriodId)

  const rawTeams = ((leagueData.teams as unknown[]) ?? []) as RawTeam[];

  // Find my team via SWID matching
  const myRaw = rawTeams.find((t) =>
    swidMatchOwner(swid, t.primaryOwner ?? "") ||
    (t.owners ?? []).some((o) => swidMatchOwner(swid, o))
  );

  if (!myRaw) {
    return NextResponse.json(
      { error: "Could not find your team — check that your SWID is correct." },
      { status: 422 },
    );
  }

  // ── Step 2: Matchup schedule ───────────────────────────────────────────────
  // mMatchupScore extends mMatchup with rosterForCurrentScoringPeriod entries
  // (all players who appeared on each team's roster this period, incl. dropped players)
  const weeklyUrl =
    `${base}/${leagueId}?scoringPeriodId=${currentScoringPeriodId}&view=mMatchup&view=mMatchupScore`;

  let matchupData: Record<string, unknown>;
  try {
    const res = await espnFetch(weeklyUrl, espnS2, swid);
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `ESPN matchup fetch returned ${res.status}`, detail: text.slice(0, 200) },
        { status: res.status },
      );
    }
    matchupData = await res.json();
  } catch (err) {
    return NextResponse.json({ error: "Network error reaching ESPN", detail: String(err) }, { status: 502 });
  }

  const schedule = ((matchupData.schedule as unknown[]) ?? []) as RawScheduleEntry[];

  // Find my matchup for the resolved period (exact match first, then ±1 fallback)
  let myMatchup: RawScheduleEntry | undefined =
    schedule.find(
      (m) => m.matchupPeriodId === resolvedPeriod &&
        (m.home.teamId === myRaw.id || m.away?.teamId === myRaw.id),
    );

  if (!myMatchup) {
    // Fallback: try adjacent periods (ESPN sometimes advances the counter early)
    for (const offset of [1, -1, 2, -2]) {
      myMatchup = schedule.find(
        (m) => m.matchupPeriodId === resolvedPeriod + offset &&
          (m.home.teamId === myRaw.id || m.away?.teamId === myRaw.id),
      );
      if (myMatchup) break;
    }
  }

  if (!myMatchup) {
    return NextResponse.json(
      { error: `Could not find your matchup for period ${resolvedPeriod} in the ESPN schedule.` },
      { status: 422 },
    );
  }

  // numWeeks: calendar weeks this matchup spans (1 = standard, 2 = 2-week matchup).
  // Use the actual matched period ID (in case the fallback search found an adjacent period).
  // Handles both array form [36, 37] and object form { "0": 36, "1": 37 }.
  function parseNumWeeks(entry: unknown): number {
    if (Array.isArray(entry)) return Math.max(1, (entry as unknown[]).length);
    if (entry !== null && entry !== undefined && typeof entry === "object") {
      return Math.max(1, Object.keys(entry as Record<string, unknown>).length);
    }
    return 1;
  }
  // Prefer resolvedPeriod for numWeeks — ensures correct week length for future periods
  // where myMatchup.matchupPeriodId may have fallen back to the current period.
  const numWeeks = parseNumWeeks(
    matchupPeriods[String(resolvedPeriod)] ??
    matchupPeriods[String(myMatchup.matchupPeriodId)],
  );

  const myIsHome = myMatchup.home.teamId === myRaw.id;
  const mySide = myIsHome ? myMatchup.home : myMatchup.away!;
  const oppSide = myIsHome ? myMatchup.away : myMatchup.home;

  const opponentId = oppSide?.teamId ?? null;
  const opponentRaw = opponentId != null ? rawTeams.find((t) => t.id === opponentId) : null;

  // ── Step 3: Build game counts via public ESPN NBA scoreboard ─────────────
  // Always use resolvedPeriod (not myMatchup.matchupPeriodId) so that future
  // matchups get the correct date window rather than the current period's window.
  const weekDates = getMatchupDates(currentMatchupPeriod, resolvedPeriod, numWeeks);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Initialize all NBA teams to 0
  const gamesInWeek: Record<string, number> = {};
  const gamesRemaining: Record<string, number> = {};
  for (const proTeamId of Object.values(NBA_ABBREV_TO_ESPN_ID)) {
    gamesInWeek[String(proTeamId)] = 0;
    gamesRemaining[String(proTeamId)] = 0;
  }

  // Fetch the full week schedule in one range request (falls back to per-day if needed)
  const { scheduleByDate, gamesByTeamAndDate } = await fetchNbaScheduleForWeek(weekDates);

  for (const date of weekDates) {
    const dateStr = dateToYYYYMMDD(date);
    const abbrevs = scheduleByDate.get(dateStr) ?? [];
    const isFuture = date >= today;
    for (const abbrev of abbrevs) {
      const proTeamId = NBA_ABBREV_TO_ESPN_ID[abbrev];
      if (proTeamId !== undefined) {
        gamesInWeek[String(proTeamId)]++;
        if (isFuture) gamesRemaining[String(proTeamId)]++;
      }
    }
  }

  // ── Step 4: Build roster maps for fresh team data ───────────────────────
  // IR slot IDs for this sport — players in these slots don't count.
  const irSlotSet = new Set(cfg.irSlotIds);

  // Get active (non-IR) player IDs from a team's current mRoster data.
  // Uses the same two-pass logic as useLeague.ts to handle players appearing in both IR and active slots.
  function getActivePlayerIds(team: RawTeam): Set<number> {
    const entries = team.roster?.entries ?? [];
    const irPlayerIds = new Set<number>();
    for (const e of entries) {
      if (irSlotSet.has(e.lineupSlotId ?? -1)) {
        const pid = e.playerId ?? e.playerPoolEntry?.player?.id;
        if (pid) irPlayerIds.add(pid);
      }
    }
    const activeIds = new Set<number>();
    for (const e of entries) {
      const pid = e.playerId ?? e.playerPoolEntry?.player?.id;
      if (pid && !irPlayerIds.has(pid)) activeIds.add(pid);
    }
    return activeIds;
  }

  // Build fresh roster map from mRoster data (bypasses stale localStorage cache in useLeague)
  const rosterByTeamId: Record<number, number[]> = {};
  for (const team of rawTeams) {
    rosterByTeamId[team.id] = Array.from(getActivePlayerIds(team));
  }

  // Build teamCurrentStats: actual cumulative stats for every team in the current period.
  // Extracted from the same mMatchupScore data already fetched — covers all matchups in the period.
  const teamCurrentStats: Record<number, Record<string, number>> = {};
  for (const entry of schedule) {
    if (entry.matchupPeriodId !== myMatchup.matchupPeriodId) continue;
    for (const side of [entry.home, entry.away]) {
      if (!side?.teamId || !side.cumulativeScore?.scoreByStat) continue;
      teamCurrentStats[side.teamId] = scoreByStatToRecord(side.cumulativeScore.scoreByStat);
    }
  }

  // ── Build response ────────────────────────────────────────────────────────
  const response: MatchupApiResponse = {
    myTeamId: myRaw.id,
    myTeamName: extractTeamName(myRaw),
    opponentTeamId: opponentId,
    opponentTeamName: opponentRaw ? extractTeamName(opponentRaw) : null,
    matchupPeriodId: myMatchup.matchupPeriodId,
    currentMatchupPeriodId: currentMatchupPeriod,
    totalMatchupPeriods,
    gamesInWeek,
    gamesRemaining,
    daysRemaining: weekDates.filter((d) => d >= today).length,
    myCurrentStats: scoreByStatToRecord(mySide?.cumulativeScore?.scoreByStat),
    oppCurrentStats: scoreByStatToRecord(oppSide?.cumulativeScore?.scoreByStat),
    teamCurrentStats,
    rosterByTeamId,
  };

  return NextResponse.json(response);
}
