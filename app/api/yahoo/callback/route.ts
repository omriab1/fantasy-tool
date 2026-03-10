/**
 * Yahoo OAuth 2.0 callback.
 *
 * Exchanges the authorization code for access + refresh tokens,
 * fetches the user's NBA leagues, then redirects to:
 *   /settings?yahoo_auto=1&yahoo_access_token=...&yahoo_refresh_token=...
 *              &yahoo_token_expires=...&league_key=...
 */

import { NextRequest, NextResponse } from "next/server";

const YAHOO_API_BASE = "https://fantasysports.yahooapis.com/fantasy/v2";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code         = searchParams.get("code");
  const clientId     = process.env.YAHOO_CLIENT_ID;
  const clientSecret = process.env.YAHOO_CLIENT_SECRET;
  const host         = req.headers.get("host") ?? "localhost:3001";
  const proto        = host.startsWith("localhost") ? "http" : "https";
  const appUrl       = process.env.NEXT_PUBLIC_APP_URL ?? `${proto}://${host}`;

  if (!code) {
    return NextResponse.redirect(`${appUrl}/settings?yahoo_error=no_code`);
  }
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${appUrl}/settings?yahoo_error=not_configured`);
  }

  // ── 1. Exchange code for tokens ────────────────────────────────────────────
  let accessToken = "";
  let refreshToken = "";
  let expiresMs = 0;

  try {
    const redirectUri  = `${appUrl}/api/yahoo/callback`;
    const credentials  = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const tokenRes = await fetch("https://api.login.yahoo.com/oauth2/get_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ grant_type: "authorization_code", redirect_uri: redirectUri, code }),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      console.error("Yahoo token exchange failed:", body);
      return NextResponse.redirect(`${appUrl}/settings?yahoo_error=token_exchange_failed`);
    }

    const tokens = await tokenRes.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    accessToken  = tokens.access_token;
    refreshToken = tokens.refresh_token ?? "";
    expiresMs    = Date.now() + (tokens.expires_in ?? 3600) * 1000;
  } catch (err) {
    console.error("Yahoo OAuth callback error:", err);
    return NextResponse.redirect(`${appUrl}/settings?yahoo_error=callback_error`);
  }

  // ── 2. Fetch user's NBA leagues ────────────────────────────────────────────
  let leagueKey = "";
  let allLeagueKeys: string[] = [];

  try {
    const leaguesRes = await fetch(
      `${YAHOO_API_BASE}/users;use_login=1/games;game_codes=nba/leagues?format=json`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (leaguesRes.ok) {
      const data = await leaguesRes.json() as Record<string, unknown>;

      // Navigate: fantasy_content.users.0.user[1].games.0.game[1].leagues.{n}.league[0].league_key
      try {
        const fc     = (data as { fantasy_content?: Record<string, unknown> }).fantasy_content;
        const users  = fc?.users as Record<string, unknown> | undefined;
        const user0  = users?.["0"] as Record<string, unknown> | undefined;
        const userArr = user0?.user as unknown[];
        const userGames = Array.isArray(userArr) && userArr.length > 1
          ? (userArr[1] as Record<string, unknown>)?.games
          : undefined;
        const games = userGames as Record<string, unknown> | undefined;
        const game0 = games?.["0"] as Record<string, unknown> | undefined;
        const gameArr = game0?.game as unknown[];
        const gameLeagues = Array.isArray(gameArr) && gameArr.length > 1
          ? (gameArr[1] as Record<string, unknown>)?.leagues
          : undefined;
        const leagues = gameLeagues as Record<string, unknown> | undefined;

        if (leagues) {
          const count = Number(leagues.count ?? 0);
          for (let i = 0; i < count; i++) {
            const entry = leagues[String(i)] as Record<string, unknown> | undefined;
            const lArr  = entry?.league as unknown[];
            const meta  = Array.isArray(lArr) ? lArr[0] as Record<string, unknown> : null;
            const key   = meta?.league_key ? String(meta.league_key) : "";
            if (key) allLeagueKeys.push(key);
          }
          if (allLeagueKeys.length > 0) leagueKey = allLeagueKeys[0];
        }
      } catch { /* ignore parse errors — league key will be empty */ }
    }
  } catch { /* ignore — user can enter league key manually */ }

  // ── 3. Redirect to settings ────────────────────────────────────────────────
  const settingsUrl = new URL(`${appUrl}/settings`);
  settingsUrl.searchParams.set("yahoo_auto", "1");
  settingsUrl.searchParams.set("yahoo_access_token", accessToken);
  if (refreshToken) settingsUrl.searchParams.set("yahoo_refresh_token", refreshToken);
  settingsUrl.searchParams.set("yahoo_token_expires", String(expiresMs));
  if (leagueKey) settingsUrl.searchParams.set("league_key", leagueKey);
  if (allLeagueKeys.length > 1) {
    settingsUrl.searchParams.set("all_league_keys", allLeagueKeys.join(","));
  }

  return NextResponse.redirect(settingsUrl.toString());
}
