// ESPN Stat ID mapping
export const STAT_IDS = {
  PTS: 0,
  BLK: 1,
  STL: 2,
  AST: 3,
  REB: 6,
  TO: 11,
  FGM: 13,
  FGA: 14,
  FTM: 15,
  FTA: 16,
  "3PM": 17,
  "3PA": 18,
  GP: 42,
} as const;

export const CATEGORIES = ["eFG%", "FT%", "3PM", "REB", "AST", "STL", "BLK", "TO", "PTS"] as const;
export type Category = (typeof CATEGORIES)[number];

// Lower is better for TO
export const LOWER_IS_BETTER: Category[] = ["TO"];

export interface RawStats {
  [statId: number]: number;
}

export interface PlayerStats {
  playerId: number;
  playerName: string;
  teamAbbrev: string;
  position: string;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  to: number;
  threepm: number;
  fgm: number;
  fga: number;
  ftm: number;
  fta: number;
  threepa: number;
  gp: number;
}

export interface AggregatedStats {
  PTS: number;
  REB: number;
  AST: number;
  STL: number;
  BLK: number;
  TO: number;
  "3PM": number;
  "eFG%": number;
  "FT%": number;
}

export interface CategoryResult {
  category: Category;
  giving: number;
  receiving: number;
  delta: number;
  winner: "receiving" | "giving" | "push";
}

export interface TradeAnalysis {
  results: CategoryResult[];
  winsForReceiving: number;
  totalCats: number;
}

export interface LeagueTeam {
  id: number;
  name: string;
  abbreviation: string;
  ownerId: string;
  rosterPlayerIds: number[];
}

export interface LeagueInfo {
  leagueId: string;
  seasonId: number;
  scoringPeriodId: number;
  teams: LeagueTeam[];
}

export interface WeeklyTeamStats {
  teamId: number;
  teamName: string;
  stats: AggregatedStats;
}

export interface AppSettings {
  leagueId: string;
  espnS2: string;
  swid: string;
}

export type StatsWindow = "season" | "30" | "15" | "7";

export interface EspnPlayerInfo {
  playerId: number;
  playerName: string;
  teamAbbrev: string;
  position: string;
  stats: {
    [window in StatsWindow]?: PlayerStats;
  };
}
