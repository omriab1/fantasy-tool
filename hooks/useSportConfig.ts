"use client";

import { useSyncExternalStore } from "react";
import { SPORT_CONFIGS } from "@/lib/sports-config";
import type { SportConfig } from "@/lib/sports-config";
import type { EspnSport } from "@/lib/types";

function subscribe(callback: () => void) {
  window.addEventListener("fantasy-settings-changed", callback);
  return () => window.removeEventListener("fantasy-settings-changed", callback);
}

function getSnapshot(): EspnSport {
  const stored = localStorage.getItem("espn_sport") as EspnSport | null;
  return stored && stored in SPORT_CONFIGS ? stored : "fba";
}

// Server snapshot: always return default (localStorage not available during SSR)
function getServerSnapshot(): EspnSport {
  return "fba";
}

export function useSportConfig(): SportConfig {
  const sport = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return SPORT_CONFIGS[sport] ?? SPORT_CONFIGS.fba;
}
