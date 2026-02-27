"use client";

import { useState, useEffect } from "react";
import { SPORT_CONFIGS } from "@/lib/sports-config";
import type { SportConfig } from "@/lib/sports-config";
import type { EspnSport } from "@/lib/types";

export function useSportConfig(): SportConfig {
  const [sport, setSport] = useState<EspnSport>("fba");

  useEffect(() => {
    const stored = localStorage.getItem("espn_sport") as EspnSport | null;
    if (stored && stored in SPORT_CONFIGS) setSport(stored);
  }, []);

  return SPORT_CONFIGS[sport];
}
