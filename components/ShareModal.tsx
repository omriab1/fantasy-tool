"use client";

import { useState, useRef, useCallback, useEffect, useLayoutEffect } from "react";
import { ShareCard } from "./ShareCard";
import type { PlayerStats, TradeAnalysis, LeagueScoringConfig } from "@/lib/types";

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  givingPlayers: PlayerStats[];
  receivingPlayers: PlayerStats[];
  analysis: TradeAnalysis;
  scoringConfig: LeagueScoringConfig;
  sportEmoji?: string;
}

// Preview card base width. Modal is 520px max; with 20px padding each side
// the card fills exactly 480px on desktop — no zoom, no wasted space.
const PREVIEW_CARD_W = 480;
// Export card is larger for a high-res PNG.
const EXPORT_CARD_W = 700;
// Modal chrome height subtracted when computing available preview height.
const CHROME_H = 200;

export function ShareModal({
  open,
  onClose,
  givingPlayers,
  receivingPlayers,
  analysis,
  scoringConfig,
  sportEmoji = "🏀",
}: ShareModalProps) {
  const [flipped, setFlipped] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "copying" | "sharing">("idle");
  const [canNativeShare, setCanNativeShare] = useState(false);

  // Horizontal zoom so card fills available width on narrow viewports (mobile).
  // On desktop (≥520px modal) this is always 1 — card shown at full 480px.
  const [previewScale, setPreviewScale] = useState(1);
  // Whether to allow vertical scrolling inside the preview area
  // (used when the trade is large and the card doesn't fit even after scaling).
  const [allowScroll, setAllowScroll] = useState(false);

  // Visible card — measured for scale computation.
  const visibleCardRef = useRef<HTMLDivElement>(null);
  // Hidden full-size card — used only for PNG export.
  const captureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setFlipped(false);
      setStatus("idle");
    }
  }, [open]);

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

  // Compute scale synchronously before paint — no flicker.
  // Scale is width-only: the card always fills the available horizontal space.
  // Vertical overflow triggers scroll rather than further shrinking.
  useLayoutEffect(() => {
    if (!open) return;
    const card = visibleCardRef.current;
    if (!card) return;

    const cardH = card.scrollHeight;
    if (cardH <= 0) return;

    // Available width inside the modal preview (modal 520px - 40px padding)
    const availW = Math.min(window.innerWidth - 32, 520) - 40;
    const scale = Math.min(1, availW / PREVIEW_CARD_W);
    setPreviewScale(scale);

    // Allow scroll if the card (at this scale) is taller than available height
    const availH = window.innerHeight - CHROME_H;
    setAllowScroll(cardH * scale > availH);
  }, [open, flipped, givingPlayers, receivingPlayers]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => {
      const card = visibleCardRef.current;
      if (!card) return;
      const cardH = card.scrollHeight;
      if (cardH <= 0) return;
      const availW = Math.min(window.innerWidth - 32, 520) - 40;
      const scale = Math.min(1, availW / PREVIEW_CARD_W);
      setPreviewScale(scale);
      const availH = window.innerHeight - CHROME_H;
      setAllowScroll(cardH * scale > availH);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  const getDataUrl = useCallback(async () => {
    const { toPng } = await import("html-to-image");
    const el = captureRef.current!;
    return toPng(el, {
      pixelRatio: 2,
      cacheBust: true,
      width: el.offsetWidth,
      height: el.scrollHeight,
    });
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
      const file = new File([blob], "trade-analysis.png", { type: "image/png" });
      await navigator.share({
        files: [file],
        text: "I used https://fantasy-tool-roan.vercel.app/ to analyze this trade",
      });
    } catch {
      // User cancelled or browser error — no-op
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

  const cardProps = { givingPlayers, receivingPlayers, analysis, scoringConfig, flipped, sportEmoji };

  return (
    <>
      {/* Hidden export card — opacity 0 so it's always fully rendered.
          Larger card width = bigger, more readable PNG. */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: EXPORT_CARD_W,
          opacity: 0,
          pointerEvents: "none",
          zIndex: -1,
        }}
      >
        <ShareCard ref={captureRef} cardWidth={EXPORT_CARD_W} {...cardProps} />
      </div>

      {/* Overlay */}
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
        {/* Modal */}
        <div
          style={{
            backgroundColor: "#1a1f2e",
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.08)",
            width: "100%",
            maxWidth: 520,
            maxHeight: "calc(100vh - 32px)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
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

          {/* Preview */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowX: "hidden",
              overflowY: allowScroll ? "auto" : "hidden",
              padding: "20px",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <div style={{ zoom: previewScale } as React.CSSProperties}>
              <ShareCard ref={visibleCardRef} cardWidth={PREVIEW_CARD_W} {...cardProps} />
            </div>
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

            {canNativeShare && (
              <button
                onClick={handleShare}
                disabled={busy}
                style={{ ...btnBase, background: "#3b82f6", color: "#ffffff" }}
              >
                {status === "sharing" ? "Sharing…" : "Share 📱"}
              </button>
            )}

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
    </>
  );
}
