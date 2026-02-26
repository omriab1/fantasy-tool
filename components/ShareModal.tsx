"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { ShareCard } from "./ShareCard";
import type { PlayerStats, TradeAnalysis } from "@/lib/types";

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  givingPlayers: PlayerStats[];
  receivingPlayers: PlayerStats[];
  analysis: TradeAnalysis;
}

export function ShareModal({
  open,
  onClose,
  givingPlayers,
  receivingPlayers,
  analysis,
}: ShareModalProps) {
  const [flipped, setFlipped] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "copying" | "sharing">("idle");
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [imageDataUrls, setImageDataUrls] = useState<Record<string, string>>({});
  const [imagesReady, setImagesReady] = useState(false);

  const captureRef = useRef<HTMLDivElement>(null);

  // Reset state and pre-fetch all images as base64 data URLs when modal opens.
  // html-to-image then sees inline data URLs — no external fetching, no CORS, images always appear.
  useEffect(() => {
    if (!open) return;
    setFlipped(false);
    setStatus("idle");
    setImagesReady(false);

    const allPlayers = [...givingPlayers, ...receivingPlayers];
    const uniqueIds = [...new Set(allPlayers.map((p) => p.playerId))];
    const uniqueAbbrevs = [
      ...new Set(allPlayers.map((p) => p.teamAbbrev).filter((a) => a !== "0")),
    ];

    const fetches = [
      ...uniqueIds.map(async (id) => {
        const data = await toDataUrl(
          `/api/espn/img?path=i/headshots/nba/players/full/${id}.png`
        );
        return data ? ([String(id), data] as [string, string]) : null;
      }),
      ...uniqueAbbrevs.map(async (abbrev) => {
        const data = await toDataUrl(
          `/api/espn/img?path=i/teamlogos/nba/500/${abbrev}.png`
        );
        return data ? ([`team_${abbrev}`, data] as [string, string]) : null;
      }),
    ];

    Promise.all(fetches).then((results) => {
      const map: Record<string, string> = {};
      for (const r of results) {
        if (r) map[r[0]] = r[1];
      }
      setImageDataUrls(map);
      setImagesReady(true);
    });
  }, [open, givingPlayers, receivingPlayers]);

  // Detect Web Share API with file support (runs client-side only)
  useEffect(() => {
    try {
      const testFile = new File([], "x.png", { type: "image/png" });
      setCanNativeShare(
        typeof navigator.share === "function" &&
          typeof navigator.canShare === "function" &&
          navigator.canShare({ files: [testFile] })
      );
    } catch {
      setCanNativeShare(false);
    }
  }, []);

  const getDataUrl = useCallback(async () => {
    const { toPng } = await import("html-to-image");
    return toPng(captureRef.current!, { pixelRatio: 2, cacheBust: true });
  }, []);

  const handleDownload = async () => {
    setStatus("loading");
    try {
      const dataUrl = await getDataUrl();
      const link = document.createElement("a");
      link.download = "trade-analysis.png";
      link.href = dataUrl;
      link.click();
    } finally {
      setStatus("idle");
    }
  };

  const handleCopy = async () => {
    setStatus("copying");
    try {
      const dataUrl = await getDataUrl();
      const blob = await fetch(dataUrl).then((r) => r.blob());
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
    } finally {
      setStatus("idle");
    }
  };

  const handleShare = async () => {
    setStatus("sharing");
    try {
      const dataUrl = await getDataUrl();
      const blob = await fetch(dataUrl).then((r) => r.blob());
      const file = new File([blob], "trade-analysis.png", {
        type: "image/png",
      });
      await navigator.share({
        files: [file],
        text: "I used https://fantasy-tool-roan.vercel.app/ to analyze this trade",
      });
    } catch {
      // User cancelled share or browser error — no-op
    } finally {
      setStatus("idle");
    }
  };

  if (!open) return null;

  const busy = status !== "idle";

  const btnBase: React.CSSProperties = {
    border: "none",
    borderRadius: 8,
    padding: "9px 16px",
    fontSize: 13,
    fontWeight: 600,
    cursor: busy ? "default" : "pointer",
    opacity: busy ? 0.65 : 1,
    transition: "opacity 0.15s",
  };

  const cardProps = {
    givingPlayers,
    receivingPlayers,
    analysis,
    flipped,
    imageDataUrls,
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        backgroundColor: "rgba(0,0,0,0.72)",
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "#1a1f2e",
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.08)",
          width: "100%",
          maxWidth: 520,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          maxHeight: "90vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 20px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 600, color: "#ffffff" }}>
            Share Trade Card
          </span>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#6b7280",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
              padding: "4px 6px",
              borderRadius: 6,
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Card preview — also the capture target once images are ready */}
        <div
          style={{
            overflowY: "auto",
            overflowX: "auto",
            padding: "20px",
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-start",
            flexShrink: 1,
            minHeight: 80,
          }}
        >
          {imagesReady ? (
            <ShareCard ref={captureRef} {...cardProps} />
          ) : (
            <div
              style={{
                color: "#6b7280",
                fontSize: 13,
                padding: "24px 0",
              }}
            >
              Loading players…
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div
          style={{
            padding: "14px 20px",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexShrink: 0,
            flexWrap: "wrap",
          }}
        >
          {/* Flip button — always shown */}
          <button
            onClick={() => setFlipped((f) => !f)}
            disabled={busy}
            style={{
              ...btnBase,
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "#e5e7eb",
            }}
          >
            ↔ Flip
          </button>

          <div style={{ flex: 1 }} />

          {/* Mobile: single native share button */}
          {canNativeShare && (
            <button
              onClick={handleShare}
              disabled={busy}
              style={{ ...btnBase, background: "#3b82f6", color: "#ffffff" }}
            >
              {status === "sharing" ? "Sharing…" : "Share 📱"}
            </button>
          )}

          {/* Desktop: Copy + Download */}
          {!canNativeShare && (
            <>
              <button
                onClick={handleCopy}
                disabled={busy}
                style={{
                  ...btnBase,
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "#e5e7eb",
                }}
              >
                {status === "copying" ? "Copying…" : "Copy Image"}
              </button>
              <button
                onClick={handleDownload}
                disabled={busy}
                style={{ ...btnBase, background: "#3b82f6", color: "#ffffff" }}
              >
                {status === "loading" ? "Preparing…" : "Download PNG"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
