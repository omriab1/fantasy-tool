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

  // Hidden full-size card used for PNG capture
  const captureRef = useRef<HTMLDivElement>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setFlipped(false);
      setStatus("idle");
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

        {/* Scrollable card preview — also the capture target.
            Capturing the visible card guarantees images are already loaded. */}
        <div
          style={{
            overflowY: "auto",
            overflowX: "auto",
            padding: "20px",
            display: "flex",
            justifyContent: "center",
            flexShrink: 1,
          }}
        >
          <ShareCard ref={captureRef} {...cardProps} />
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
