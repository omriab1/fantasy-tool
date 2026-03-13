import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f97316",
          borderRadius: "40px",
        }}
      >
        <span
          style={{
            fontSize: 80,
            fontWeight: 800,
            color: "#000",
            letterSpacing: "-3px",
          }}
        >
          FT
        </span>
      </div>
    ),
    { ...size }
  );
}
