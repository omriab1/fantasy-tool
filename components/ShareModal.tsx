"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { ShareCard } from "./ShareCard";
import type { PlayerStats, TradeAnalysis } from "@/lib/types";

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
  const [previewScale, setPreviewScale] = useState(1);

  // Hidden full-size card — used only for PNG export
  const captureRef = useRef<HTMLDivElement>(null);
  // Preview area container — used to measure available space
  const previewAreaRef = useRef<HTMLDivElement>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setFlipped(false);
      setStatus("idle");
      setPreviewScale(1);
    }
  }, [open]);

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

  // Compute zoom scale so the card always fits the preview area without scrolling
  useEffect(() => {
    if (!open) return;

    const compute = () => {
      const area = previewAreaRef.current;
      const card = captureRef.current;
      if (!area || !card) return;

      const availH = area.clientHeight - 40; // 20px top + 20px bottom padding
      const availW = area.clientWidth - 40;
      const cardH = card.scrollHeight;
      const cardW = 420;

      const s = Math.min(1, availH / cardH, availW / cardW);
      setPreviewScale(Math.max(0.3, s)); // never go below 30%
    };

    // Wait one frame for layout to settle, then compute
    const raf = requestAnimationFrame(compute);

    // Also recompute on window resize (e.g. phone rotation)
    window.addEventListener("resize", compute);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", compute);
    };
  }, [open, flipped, givingPlayers, receivingPlayers]);

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
  };

  return (
    <>
      {/* Hidden full-size card used only for PNG export.
          Positioned off-screen so browser still renders it properly. */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: "-9999px",
          pointerEvents: "none",
          zIndex: -1,
        }}
      >
        <ShareCard ref={captureRef} {...cardProps} />
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
        {/* Modal — fixed height so preview area has a known size */}
        <div
          style={{
            backgroundColor: "#1a1f2e",
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.08)",
            width: "100%",
            maxWidth: 520,
            height: "calc(100vh - 32px)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
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

          {/* Preview area — fills remaining height, card is zoom-scaled to fit */}
          <div
            ref={previewAreaRef}
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "20px",
              overflow: "hidden",
            }}
          >
            <div style={{ zoom: previewScale } as React.CSSProperties}>
              <ShareCard {...cardProps} />
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
    </>
  );
}
