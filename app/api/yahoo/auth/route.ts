/**
 * Yahoo OAuth 2.0 authorization redirect.
 *
 * Setup:
 *   1. Register at https://developer.yahoo.com/apps/create/
 *   2. Redirect URI: {NEXT_PUBLIC_APP_URL}/api/yahoo/callback
 *   3. Set env vars: YAHOO_CLIENT_ID, YAHOO_CLIENT_SECRET, NEXT_PUBLIC_APP_URL
 */

import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const clientId = process.env.YAHOO_CLIENT_ID;
  const host     = req.headers.get("host") ?? "localhost:3001";
  const proto    = host.startsWith("localhost") ? "http" : "https";
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? `${proto}://${host}`;

  if (!clientId) {
    return NextResponse.json(
      { error: "Yahoo OAuth not configured. Add YAHOO_CLIENT_ID and YAHOO_CLIENT_SECRET to .env.local and restart." },
      { status: 501 }
    );
  }

  const redirectUri = `${appUrl}/api/yahoo/callback`;
  const authUrl = new URL("https://api.login.yahoo.com/oauth2/request_auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("state", Math.random().toString(36).slice(2));

  // Debug: return the URL as JSON to verify it's correct
  const { searchParams } = new URL(req.url);
  if (searchParams.get("debug") === "1") {
    return NextResponse.json({ authUrl: authUrl.toString(), redirectUri, appUrl, clientId: clientId.slice(0, 20) + "..." });
  }

  return NextResponse.redirect(authUrl.toString());
}
