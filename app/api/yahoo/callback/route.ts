/**
 * Yahoo OAuth callback — stub for OAuth fallback.
 *
 * Exchanges authorization code for access + refresh tokens, then redirects
 * to /settings?yahoo_auto=1&... with the credentials.
 *
 * Only enabled when YAHOO_CLIENT_ID + YAHOO_CLIENT_SECRET env vars are set.
 */

import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const clientId = process.env.YAHOO_CLIENT_ID;
  const clientSecret = process.env.YAHOO_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";

  if (!code) {
    return NextResponse.redirect(`${appUrl}/settings?yahoo_error=no_code`);
  }

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${appUrl}/settings?yahoo_error=not_configured`);
  }

  try {
    const redirectUri = `${appUrl}/api/yahoo/callback`;
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const tokenRes = await fetch("https://api.login.yahoo.com/oauth2/get_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code,
      }),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      console.error("Yahoo OAuth token exchange failed:", body);
      return NextResponse.redirect(`${appUrl}/settings?yahoo_error=token_exchange_failed`);
    }

    const tokens = await tokenRes.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    const expires = Date.now() + (tokens.expires_in ?? 3600) * 1000;

    // Redirect to settings with tokens — settings page reads yahoo_auto=1 and saves to localStorage
    const settingsUrl = new URL(`${appUrl}/settings`);
    settingsUrl.searchParams.set("yahoo_auto", "1");
    settingsUrl.searchParams.set("yahoo_access_token", tokens.access_token);
    settingsUrl.searchParams.set("yahoo_refresh_token", tokens.refresh_token);
    settingsUrl.searchParams.set("yahoo_token_expires", String(expires));

    return NextResponse.redirect(settingsUrl.toString());
  } catch (err) {
    console.error("Yahoo OAuth callback error:", err);
    return NextResponse.redirect(`${appUrl}/settings?yahoo_error=callback_error`);
  }
}
