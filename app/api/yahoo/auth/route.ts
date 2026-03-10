/**
 * Yahoo OAuth 2.0 authorization redirect.
 *
 * Setup:
 *   1. Register at https://developer.yahoo.com/apps/create/
 *   2. Redirect URI: {NEXT_PUBLIC_APP_URL}/api/yahoo/callback
 *   3. Set env vars: YAHOO_CLIENT_ID, YAHOO_CLIENT_SECRET, NEXT_PUBLIC_APP_URL
 */

import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.YAHOO_CLIENT_ID;
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";

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
  authUrl.searchParams.set("scope", "fspt-r");
  authUrl.searchParams.set("language", "en-us");

  return NextResponse.redirect(authUrl.toString());
}
