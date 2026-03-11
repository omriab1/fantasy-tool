/**
 * Yahoo debug endpoint — returns raw stat_categories from Yahoo settings.
 * Used to inspect what Yahoo actually returns so we can fix the parser.
 *
 * GET /api/yahoo/debug?leagueKey=428.l.19877
 */
import { NextRequest, NextResponse } from "next/server";

const YAHOO_API_BASE = "https://fantasysports.yahooapis.com/fantasy/v2";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const leagueKey   = searchParams.get("leagueKey") ?? "";
  const accessToken = req.headers.get("x-yahoo-access-token") ?? "";
  const b = req.headers.get("x-yahoo-b") ?? "";
  const t = req.headers.get("x-yahoo-t") ?? "";

  if (!leagueKey) return NextResponse.json({ error: "Missing leagueKey" }, { status: 400 });

  const headers: Record<string, string> = { Accept: "application/json" };
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
  else { headers["Cookie"] = `B=${b}; T=${t}`; }

  const res = await fetch(
    `${YAHOO_API_BASE}/league/${leagueKey}?format=json&out=settings`,
    { headers, cache: "no-store" }
  );

  if (!res.ok) {
    return NextResponse.json({ error: `Yahoo returned ${res.status}` }, { status: res.status });
  }

  const data = await res.json() as Record<string, unknown>;

  try {
    const fc       = (data as { fantasy_content?: Record<string, unknown> }).fantasy_content;
    const arr      = fc?.league as unknown[];
    const leaf     = Array.isArray(arr) && arr.length > 1 ? (arr[1] as Record<string, unknown>) : null;
    const settings = leaf?.settings as Record<string, unknown> | null ?? null;

    return NextResponse.json({
      settings_keys:       settings ? Object.keys(settings) : null,
      stat_categories_raw: settings?.stat_categories ?? null,
      stat_modifiers_raw:  settings?.stat_modifiers  ?? null,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) });
  }
}
