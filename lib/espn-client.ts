import type { StatsWindow } from "./types";

// All ESPN requests go through our Next.js API proxy (avoids CORS)

export async function fetchLeague(leagueId: string): Promise<Response> {
  return fetch(`/api/espn/league?leagueId=${encodeURIComponent(leagueId)}`);
}

export async function fetchPlayers(leagueId: string, window: StatsWindow): Promise<Response> {
  return fetch(
    `/api/espn/players?leagueId=${encodeURIComponent(leagueId)}&window=${encodeURIComponent(window)}`
  );
}

export async function fetchWeekly(leagueId: string, period: number): Promise<Response> {
  return fetch(
    `/api/espn/weekly?leagueId=${encodeURIComponent(leagueId)}&period=${encodeURIComponent(period)}`
  );
}

export function getSettings(): { leagueId: string; espnS2: string; swid: string } | null {
  if (typeof window === "undefined") return null;
  const leagueId = localStorage.getItem("espn_leagueId") ?? "";
  const espnS2 = localStorage.getItem("espn_s2") ?? "";
  const swid = localStorage.getItem("espn_swid") ?? "";
  if (!leagueId || !espnS2 || !swid) return null;
  return { leagueId, espnS2, swid };
}

export function saveSettings(leagueId: string, espnS2: string, swid: string): void {
  localStorage.setItem("espn_leagueId", leagueId);
  localStorage.setItem("espn_s2", espnS2);
  localStorage.setItem("espn_swid", swid);
}
