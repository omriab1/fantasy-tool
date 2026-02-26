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
  /** Card width in px — all internal sizes scale proportionally. Default 480. */
  cardWidth?: number;
}

// Base design is 480px wide. All sizes below are at base=480.
const BASE = 480;

export const ShareCard = forwardRef<HTMLDivElement, ShareCardProps>(
  ({ givingPlayers, receivingPlayers, analysis, flipped, cardWidth = BASE }, ref) => {
    const s = cardWidth / BASE;
    const sc = (n: number) => Math.round(n * s); // scaled px value

    const leftPlayers = flipped ? receivingPlayers : givingPlayers;
    const rightPlayers = flipped ? givingPlayers : receivingPlayers;

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
      padding: `${sc(12)}px ${sc(14)}px ${sc(7)}px`,
      fontSize: sc(12),
      fontWeight: 700,
      letterSpacing: "0.12em",
      color: "#6b7280",
      textTransform: "uppercase",
    };

    return (
      <div
        ref={ref}
        style={{
          width: cardWidth,
          backgroundColor: "#0f1117",
          borderRadius: sc(14),
          overflow: "hidden",
          fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
          color: "#ffffff",
        }}
      >
        {/* Branded header */}
        <div
          style={{
            backgroundColor: "#13161f",
            padding: `${sc(16)}px ${sc(22)}px`,
            borderBottom: "1px solid rgba(255,255,255,0.1)",
            display: "flex",
            alignItems: "center",
            gap: sc(12),
          }}
        >
          <span style={{ fontSize: sc(26) }}>🏀</span>
          <div>
            <div
              style={{
                fontSize: sc(17),
                fontWeight: 700,
                color: "#ffffff",
                letterSpacing: "-0.01em",
              }}
            >
              Fantasy Tool
            </div>
            <div style={{ fontSize: sc(12), color: "#6b7280", marginTop: sc(1) }}>
              Trade Analyzer
            </div>
          </div>
        </div>

        {/* Player columns */}
        <div style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
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

          {Array.from({ length: maxRows }).map((_, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                borderTop: "1px solid rgba(255,255,255,0.04)",
              }}
            >
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: sc(7),
                  padding: `${sc(8)}px ${sc(16)}px`,
                  minWidth: 0,
                }}
              >
                {leftPlayers[i] && (
                  <>
                    <span
                      style={{
                        flex: 1,
                        fontSize: sc(13),
                        color: "#e5e7eb",
                        fontWeight: 500,
                        minWidth: 0,
                        overflowWrap: "break-word",
                        lineHeight: 1.35,
                      }}
                    >
                      {leftPlayers[i].playerName}
                    </span>
                    <span
                      style={{
                        fontSize: sc(12),
                        color: "#6b7280",
                        flexShrink: 0,
                        paddingTop: sc(1),
                      }}
                    >
                      {leftPlayers[i].position}
                    </span>
                  </>
                )}
              </div>

              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: sc(7),
                  padding: `${sc(8)}px ${sc(16)}px`,
                  minWidth: 0,
                  borderLeft: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                {rightPlayers[i] && (
                  <>
                    <span
                      style={{
                        flex: 1,
                        fontSize: sc(13),
                        color: "#e5e7eb",
                        fontWeight: 500,
                        minWidth: 0,
                        overflowWrap: "break-word",
                        lineHeight: 1.35,
                      }}
                    >
                      {rightPlayers[i].playerName}
                    </span>
                    <span
                      style={{
                        fontSize: sc(12),
                        color: "#6b7280",
                        flexShrink: 0,
                        paddingTop: sc(1),
                      }}
                    >
                      {rightPlayers[i].position}
                    </span>
                  </>
                )}
              </div>
            </div>
          ))}

          <div style={{ display: "flex" }}>
            <div style={{ flex: 1, padding: `${sc(5)}px ${sc(14)}px` }} />
            <div
              style={{
                flex: 1,
                padding: `${sc(5)}px ${sc(14)}px`,
                borderLeft: "1px solid rgba(255,255,255,0.08)",
              }}
            />
          </div>
        </div>

        {/* Verdict */}
        <div
          style={{
            padding: `${sc(20)}px ${sc(24)}px`,
            textAlign: "center",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            backgroundColor: "rgba(255,255,255,0.02)",
          }}
        >
          <div
            style={{
              fontSize: sc(21),
              fontWeight: 800,
              color: verdictColor,
              letterSpacing: "0.02em",
            }}
          >
            {verdictEmoji} {verdictText}
          </div>
          <div style={{ fontSize: sc(15), color: "#9ca3af", marginTop: sc(6) }}>
            {winsForReceiving}W &mdash; {losses}L
            {equals > 0 ? ` \u2014 ${equals}T` : ""}
          </div>
        </div>

        {/* Category table */}
        <div style={{ paddingTop: sc(12), paddingBottom: sc(24) }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: `${sc(4)}px ${sc(18)}px ${sc(6)}px`,
            }}
          >
            {[
              { w: sc(76), align: "center" as const, label: "CAT" },
              { w: sc(90), align: "center" as const, label: "GIVE" },
              { w: sc(90), align: "center" as const, label: "RECV" },
              { w: undefined, align: "center" as const, label: "DIFF" },
              { w: sc(42), align: "center" as const, label: "RES" },
            ].map(({ w, align, label }) => (
              <div
                key={label}
                style={{
                  ...(w ? { width: w } : { flex: 1 }),
                  textAlign: align,
                  fontSize: sc(10),
                  color: "#4b5563",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                {label}
              </div>
            ))}
          </div>

          {displayAnalysis.results.map((row) => {
            const isWin = row.winner === "receiving";
            const isLoss = row.winner === "giving";
            const bgColor = isWin
              ? "rgba(74,222,128,0.08)"
              : isLoss
              ? "rgba(248,113,113,0.08)"
              : "transparent";
            const resultChar = isWin ? "W" : isLoss ? "L" : "T";
            const resultColor = isWin ? "#4ade80" : isLoss ? "#f87171" : "#9ca3af";
            const deltaStr = (row.delta > 0 ? "+" : "") + fmt(row.delta, row.category);

            return (
              <div
                key={row.category}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: `${sc(6)}px ${sc(18)}px`,
                  backgroundColor: bgColor,
                }}
              >
                <div
                  style={{
                    width: sc(76),
                    textAlign: "center",
                    fontSize: sc(13),
                    color: "#9ca3af",
                    fontWeight: 600,
                    letterSpacing: "0.03em",
                  }}
                >
                  {row.category}
                </div>
                <div style={{ width: sc(90), textAlign: "center", fontSize: sc(14), color: "#d1d5db" }}>
                  {fmt(row.giving, row.category)}
                </div>
                <div style={{ width: sc(90), textAlign: "center", fontSize: sc(14), color: "#d1d5db" }}>
                  {fmt(row.receiving, row.category)}
                </div>
                <div style={{ flex: 1, textAlign: "center", fontSize: sc(13), color: "#6b7280" }}>
                  {deltaStr}
                </div>
                <div
                  style={{
                    width: sc(42),
                    textAlign: "center",
                    fontSize: sc(13),
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
