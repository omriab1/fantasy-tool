/**
 * Static lookup: team abbreviation → ESPN Fantasy proTeamId.
 *
 * Covers both the "official" ESPN Fantasy abbreviations (GSW, NOP, PHX, SAS, NYK)
 * AND the short-form abbreviations used by the ESPN public scoreboard API
 * (GS, NO, PHO, SA, NY, etc.) — both forms map to the same proTeamId.
 */
export const NBA_ABBREV_TO_ESPN_ID: Record<string, number> = {
  // Atlanta Hawks
  ATL: 1,
  // Boston Celtics
  BOS: 2,
  // New Orleans Pelicans (full form + ESPN scoreboard short form)
  NOP: 3, NO: 3,
  // Chicago Bulls
  CHI: 4,
  // Cleveland Cavaliers
  CLE: 5,
  // Dallas Mavericks
  DAL: 6,
  // Denver Nuggets
  DEN: 7,
  // Detroit Pistons
  DET: 8,
  // Golden State Warriors (full form + ESPN scoreboard short form)
  GSW: 9, GS: 9,
  // Houston Rockets
  HOU: 10,
  // Indiana Pacers
  IND: 11,
  // Los Angeles Clippers
  LAC: 12,
  // Los Angeles Lakers
  LAL: 13,
  // Miami Heat
  MIA: 14,
  // Milwaukee Bucks
  MIL: 15,
  // Minnesota Timberwolves
  MIN: 16,
  // Brooklyn Nets
  BKN: 17, BK: 17,
  // New York Knicks (full form + ESPN scoreboard short form)
  NYK: 18, NY: 18,
  // Orlando Magic
  ORL: 19,
  // Philadelphia 76ers
  PHI: 20,
  // Phoenix Suns (full form + ESPN scoreboard short form)
  PHX: 21, PHO: 21,
  // Portland Trail Blazers
  POR: 22,
  // Sacramento Kings
  SAC: 23,
  // San Antonio Spurs (full form + ESPN scoreboard short form)
  SAS: 24, SA: 24,
  // Oklahoma City Thunder
  OKC: 25,
  // Utah Jazz
  UTA: 26, UTAH: 26,
  // Washington Wizards (full form + ESPN scoreboard short form)
  WAS: 27, WSH: 27,
  // Toronto Raptors
  TOR: 28,
  // Memphis Grizzlies
  MEM: 29,
  // Charlotte Hornets
  CHA: 30,
};
