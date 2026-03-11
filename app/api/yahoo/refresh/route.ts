/**
 * Yahoo OAuth token refresh.
 *
 * POST /api/yahoo/refresh
 * Body: { refresh_token: string }
 *
 * Exchanges the stored refresh token for a new access token.
 * Returns: { access_token, refresh_token?, expires_at }
 */

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const refreshToken = String(body.refresh_token ?? "");

  const clientId     = process.env.YAHOO_CLIENT_ID?.trim();
  const clientSecret = process.env.YAHOO_CLIENT_SECRET?.trim();

  if (!refreshToken) {
    return NextResponse.json({ error: "Missing refresh_token" }, { status: 400 });
  }
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "Yahoo OAuth not configured" }, { status: 503 });
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  try {
    const tokenRes = await fetch("https://api.login.yahoo.com/oauth2/get_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
    });

    if (!tokenRes.ok) {
      const detail = await tokenRes.text();
      return NextResponse.json({ error: "Token refresh failed", detail: detail.slice(0, 300) }, { status: 401 });
    }

    const tokens = await tokenRes.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    return NextResponse.json({
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token, // Yahoo may or may not rotate the refresh token
      expires_at:    Date.now() + (tokens.expires_in ?? 3600) * 1000,
    });
  } catch (err) {
    return NextResponse.json({ error: "Network error", detail: String(err) }, { status: 502 });
  }
}
