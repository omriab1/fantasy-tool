"use client";

/**
 * Yahoo OAuth token management.
 *
 * getValidYahooToken() checks if the stored access token is still valid.
 * If it's expired (or expires within 5 minutes), it automatically refreshes
 * using the stored refresh token via POST /api/yahoo/refresh.
 *
 * Returns a valid access token, or the existing (possibly expired) token if
 * refresh fails — the API call will then return a 401 and the user will see
 * the "reconnect" error.
 */

export async function getValidYahooToken(): Promise<string> {
  if (typeof window === "undefined") return "";

  const accessToken  = localStorage.getItem("yahoo_access_token")  ?? "";
  if (!accessToken) return "";

  const refreshToken = localStorage.getItem("yahoo_refresh_token") ?? "";
  const expiresMs    = Number(localStorage.getItem("yahoo_token_expires") ?? "0");

  // Token valid for more than 5 more minutes — use as-is
  if (expiresMs === 0 || Date.now() < expiresMs - 5 * 60 * 1000) {
    return accessToken;
  }

  // Expired — attempt silent refresh
  if (!refreshToken) return accessToken;

  try {
    const res = await fetch("/api/yahoo/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) return accessToken;

    const data = await res.json() as {
      access_token: string;
      refresh_token?: string;
      expires_at: number;
    };

    localStorage.setItem("yahoo_access_token", data.access_token);
    localStorage.setItem("yahoo_token_expires", String(data.expires_at));
    if (data.refresh_token) {
      localStorage.setItem("yahoo_refresh_token", data.refresh_token);
    }

    return data.access_token;
  } catch {
    return accessToken;
  }
}
