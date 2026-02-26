"use client";

import { forwardRef } from "react";
import { fmt, aggregateStats } from "@/lib/stat-calculator";
import { LOWER_IS_BETTER } from "@/lib/types";
import { calcTradeScore } from "@/lib/trade-score";
import type { PlayerStats, TradeAnalysis } from "@/lib/types";

export interface ShareCardProps {
  givingPlayers: PlayerStats[];
  receivingPlayers: PlayerStats[];
  analysis: TradeAnalysis;
  flipped: boolean;
  // Pre-fetched base64 data URLs keyed by playerId (headshots) or "team_ABBREV" (logos)
  imageDataUrls?: Record<string, string>;
}

export const ShareCard = forwardRef<HTMLDivElement, ShareCardProps>(
  ({ givingPlayers, receivingPlayers, analysis, flipped, imageDataUrls }, ref) => {
    // When flipped, swap sides so the card reflects the other trader's perspective
    const leftPlayers = flipped ? receivingPlayers : givingPlayers;
    const rightPlayers = flipped ? givingPlayers : receivingPlayers;

    // Recalculate with swapped args when flipped
    const displayAnalysis: TradeAnalysis = flipped
      ? calcTradeScore(aggregateStats(receivingPlayers), aggregateStats(givingPlayers))
      : analysis;

    const { winsForReceiving, losses, equals } = displayAnalysis;

    let verdictText: string;
    let verdictEmoji: string;
    let verdictColor: string;

    if (winsForReceiving > losses) {
      verdictText = "YOU WIN THIS TRADE";
      verdictEmoji = "✅";
      verdictColor = "#4ade80";
    } else if (winsForReceiving < losses) {
      verdictText = "YOU LOSE THIS TRADE";
      verdictEmoji = "❌";
      verdictColor = "#f87171";
    } else {
      verdictText = "EVEN TRADE";
      verdictEmoji = "🤝";
      verdictColor = "#facc15";
    }

    const maxRows = Math.max(leftPlayers.length, rightPlayers.length, 1);

    const colHeaderStyle: React.CSSProperties = {
      padding: "10px 12px 6px",
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: "0.12em",
      color: "#6b7280",
      textTransform: "uppercase",
    };

    // Resolve image src: use pre-fetched data URL if available, else proxy URL
    const headshotSrc = (id: number) =>
      imageDataUrls?.[String(id)] ?? `/api/espn/img?path=i/headshots/nba/players/full/${id}.png`;
    const teamLogoSrc = (abbrev: string) =>
      imageDataUrls?.[`team_${abbrev}`] ?? `/api/espn/img?path=i/teamlogos/nba/500/${abbrev}.png`;

    return (
      <div
        ref={ref}
        style={{
          width: 420,
          backgroundColor: "#0f1117",
          borderRadius: 12,
          overflow: "hidden",
          fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
          color: "#ffffff",
        }}
      >
        {/* Branded header */}
        <div
          style={{
            backgroundColor: "#13161f",
            padding: "14px 20px",
            borderBottom: "1px solid rgba(255,255,255,0.1)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ fontSize: 22 }}>🏀</span>
          <div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: "#ffffff",
                letterSpacing: "-0.01em",
              }}
            >
              Fantasy Tool
            </div>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 1 }}>
              Trade Analyzer
            </div>
          </div>
        </div>

        {/* Player columns */}
        <div style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          {/* Column headers */}
          <div style={{ display: "flex" }}>
            <div style={{ ...colHeaderStyle, flex: 1 }}>YOU GIVE</div>
            <div
              style={{
                ...colHeaderStyle,
                flex: 1,
                borderLeft: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              YOU RECEIVE
            </div>
          </div>

          {/* Player rows — photo + name + position */}
          {Array.from({ length: maxRows }).map((_, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                borderTop: "1px solid rgba(255,255,255,0.04)",
              }}
            >
              {/* Left player cell */}
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 12px",
                  minWidth: 0,
                }}
              >
                {leftPlayers[i] ? (
                  <>
                    {/* Headshot via background-image — renders reliably in html-to-image */}
                    <div style={{ position: "relative", flexShrink: 0 }}>
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: "50%",
                          backgroundImage: `url(${headshotSrc(leftPlayers[i].playerId)})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                          backgroundColor: "rgba(255,255,255,0.08)",
                        }}
                      />
                      {leftPlayers[i].teamAbbrev !== "0" && (
                        <div
                          style={{
                            position: "absolute",
                            bottom: -2,
                            right: -2,
                            width: 13,
                            height: 13,
                            borderRadius: "50%",
                            backgroundImage: `url(${teamLogoSrc(leftPlayers[i].teamAbbrev)})`,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                            backgroundColor: "#0f1117",
                            boxShadow: "0 0 0 1.5px #0f1117",
                          }}
                        />
                      )}
                    </div>
                    {/* Name — clipped so it never overlaps the position label */}
                    <span
                      style={{
                        flex: 1,
                        fontSize: 11,
                        color: "#e5e7eb",
                        fontWeight: 500,
                        minWidth: 0,
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {leftPlayers[i].playerName}
                    </span>
                    {/* Position */}
                    <span
                      style={{
                        fontSize: 10,
                        color: "#6b7280",
                        flexShrink: 0,
                        marginLeft: 4,
                      }}
                    >
                      {leftPlayers[i].position}
                    </span>
                  </>
                ) : null}
              </div>

              {/* Right player cell */}
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 12px",
                  minWidth: 0,
                  borderLeft: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                {rightPlayers[i] ? (
                  <>
                    <div style={{ position: "relative", flexShrink: 0 }}>
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: "50%",
                          backgroundImage: `url(${headshotSrc(rightPlayers[i].playerId)})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                          backgroundColor: "rgba(255,255,255,0.08)",
                        }}
                      />
                      {rightPlayers[i].teamAbbrev !== "0" && (
                        <div
                          style={{
                            position: "absolute",
                            bottom: -2,
                            right: -2,
                            width: 13,
                            height: 13,
                            borderRadius: "50%",
                            backgroundImage: `url(${teamLogoSrc(rightPlayers[i].teamAbbrev)})`,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                            backgroundColor: "#0f1117",
                            boxShadow: "0 0 0 1.5px #0f1117",
                          }}
                        />
                      )}{/* placeholder to close the right cell block */}
                    </div>
                    <span
                      style={{
                        flex: 1,
                        fontSize: 11,
                        color: "#e5e7eb",
                        fontWeight: 500,
                        minWidth: 0,
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {rightPlayers[i].playerName}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        color: "#6b7280",
                        flexShrink: 0,
                        marginLeft: 4,
                      }}
                    >
                      {rightPlayers[i].position}
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          ))}

          {/* Bottom padding */}
          <div style={{ display: "flex" }}>
            <div style={{ flex: 1, padding: "4px 12px" }} />
            <div
              style={{
                flex: 1,
                padding: "4px 12px",
                borderLeft: "1px solid rgba(255,255,255,0.08)",
              }}
            />
          </div>
        </div>

        {/* Verdict */}
        <div
          style={{
            padding: "16px 20px",
            textAlign: "center",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            backgroundColor: "rgba(255,255,255,0.02)",
          }}
        >
          <div
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: verdictColor,
              letterSpacing: "0.02em",
            }}
          >
            {verdictEmoji} {verdictText}
          </div>
          <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 5 }}>
            {winsForReceiving}W &mdash; {losses}L
            {equals > 0 ? ` \u2014 ${equals}T` : ""}
          </div>
        </div>

        {/* Category table */}
        <div style={{ paddingTop: 10, paddingBottom: 8 }}>
          {/* Table column headers */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "3px 16px 5px",
            }}
          >
            <div
              style={{
                width: 76,
                textAlign: "right",
                fontSize: 9,
                color: "#4b5563",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              GIVE
            </div>
            <div
              style={{
                width: 64,
                textAlign: "center",
                fontSize: 9,
                color: "#4b5563",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              CAT
            </div>
            <div
              style={{
                width: 76,
                textAlign: "center",
                fontSize: 9,
                color: "#4b5563",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              RECV
            </div>
            <div
              style={{
                flex: 1,
                textAlign: "center",
                fontSize: 9,
                color: "#4b5563",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              DIFF
            </div>
            <div
              style={{
                width: 36,
                textAlign: "center",
                fontSize: 9,
                color: "#4b5563",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              RES
            </div>
          </div>

          {/* Category rows */}
          {displayAnalysis.results.map((row) => {
            const isWin = row.winner === "receiving";
            const isLoss = row.winner === "giving";
            const bgColor = isWin
              ? "rgba(74,222,128,0.08)"
              : isLoss
              ? "rgba(248,113,113,0.08)"
              : "transparent";
            const resultChar = isWin ? "W" : isLoss ? "L" : "T";
            const resultColor = isWin
              ? "#4ade80"
              : isLoss
              ? "#f87171"
              : "#9ca3af";

            const deltaStr =
              (row.delta > 0 ? "+" : "") + fmt(row.delta, row.category);

            return (
              <div
                key={row.category}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "5px 16px",
                  backgroundColor: bgColor,
                }}
              >
                <div
                  style={{
                    width: 76,
                    textAlign: "right",
                    fontSize: 12,
                    color: "#d1d5db",
                  }}
                >
                  {fmt(row.giving, row.category)}
                </div>
                <div
                  style={{
                    width: 64,
                    textAlign: "center",
                    fontSize: 11,
                    color: "#9ca3af",
                    fontWeight: 600,
                    letterSpacing: "0.03em",
                  }}
                >
                  {row.category}
                </div>
                <div
                  style={{
                    width: 76,
                    textAlign: "center",
                    fontSize: 12,
                    color: "#d1d5db",
                  }}
                >
                  {fmt(row.receiving, row.category)}
                </div>
                <div
                  style={{
                    flex: 1,
                    textAlign: "center",
                    fontSize: 11,
                    color: "#6b7280",
                  }}
                >
                  {deltaStr}
                </div>
                <div
                  style={{
                    width: 36,
                    textAlign: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    color: resultColor,
                  }}
                >
                  {resultChar}
                </div>
              </div>
            );
          })}
        </div>

      </div>
    );
  }
);

ShareCard.displayName = "ShareCard";
