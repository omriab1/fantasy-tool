import { NextRequest } from "next/server";

// Proxy for ESPN CDN images — avoids CORS issues when html-to-image
// fetches external URLs to embed them in the exported PNG.
export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path");
  if (!path) return new Response("Missing path", { status: 400 });

  const url = `https://a.espncdn.com/${path}`;
  const res = await fetch(url, { next: { revalidate: 86400 } });

  if (!res.ok) return new Response(null, { status: 404 });

  const blob = await res.blob();
  return new Response(blob, {
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "image/png",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
