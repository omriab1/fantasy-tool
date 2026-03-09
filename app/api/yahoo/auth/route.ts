/**
 * Yahoo OAuth redirect — stub for OAuth fallback.
 *
 * Only needed if cookie-based auth (B + T cookies) is rejected by Yahoo's API.
 *
 * To enable:
 *   1. Register a Yahoo Developer app at https://developer.yahoo.com/apps/create/
 *   2. Set OAuth 2.0 redirect URI to: {your-domain}/api/yahoo/callback
 *   3. Add env vars: YAHOO_CLIENT_ID, YAHOO_CLIENT_SECRET
 *
 * Currently returns an error message since cookie-based auth is the primary method.
 */

import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.YAHOO_CLIENT_ID;

  if (!clientId) {
    return NextResponse.json(
      {
        error: "Yahoo OAuth not configured",
        hint: "Set YAHOO_CLIENT_ID and YAHOO_CLIENT_SECRET env vars, or use the cookie bookmarklet instead.",
      },
      { status: 501 }
    );
  }

  // OAuth 2.0 authorization URL
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001"}/api/yahoo/callback`;
  const scope = "fspt-r";
  const authUrl = new URL("https://api.login.yahoo.com/oauth2/request_auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scope);
  authUrl.searchParams.set("language", "en-us");

  return NextResponse.redirect(authUrl.toString());
}
