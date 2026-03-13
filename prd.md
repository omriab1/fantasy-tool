# ESPN Fantasy Basketball Helper — PRD

## 1. Product Overview
**Name**: `fantasy-tool`
**Type**: Standalone Next.js 15 web app (dark UI, fully responsive)
**Purpose**: Help ESPN Fantasy Basketball managers make smarter trade and matchup decisions with correct statistical math.

---

## 2. League Configuration

**Categories (9-cat)**:
| # | Category | Type | Notes |
|---|----------|------|-------|
| 1 | PTS | Counting | Higher = better |
| 2 | REB | Counting | Higher = better |
| 3 | AST | Counting | Higher = better |
| 4 | STL | Counting | Higher = better |
| 5 | BLK | Counting | Higher = better |
| 6 | TO | Counting | **Lower = better** |
| 7 | 3PM | Counting | Higher = better |
| 8 | eFG% | Percentage | `(FGM + 0.5×3PM) / FGA` — volume-weighted |
| 9 | FT% | Percentage | `FTM / FTA` — volume-weighted |

---

## 3. Feature 1: Trade Analyzer

### UX Flow
1. Settings page: League ID + espn_s2 + SWID saved to localStorage
2. Page loads all ESPN players upfront → stored in memory for instant search
3. User searches/adds players to "Giving" and "Receiving" buckets
4. User selects stats window tab: `Season | 30D | 15D | 7D`
5. Click "Analyze" → side-by-side category table + verdict headline

### Calculation Rules
- **Counting stats**: per-game avg averaged across all players in bucket
- **eFG%**: `(Σ FGMᵢ + 0.5 × Σ 3PMᵢ) / Σ FGAᵢ` — volume-weighted
- **FT%**: `Σ FTMᵢ / Σ FTAᵢ` — volume-weighted
- **Delta**: `Receiving − Giving` per category (TO inverted)

### Verdict Display
- Hero headline: `"You win 5 / 9 cats"`
- Win = positive delta (TO win = negative delta)
- Color-coded table: green = gain, red = lose

---

## 4. Feature 2: Team Comparison

### UX Flow
1. Team A auto-selected (SWID matched to league owner)
2. User picks Team B from dropdown
3. User picks time window: last N weeks or manual range
4. Click "Compare" → side-by-side category table + matchup score

### Calculation Rules
- Aggregate weekly stats across all rostered players × selected weeks
- Same volume-weighted eFG%/FT% formulas
- TO: lower is better → invert colors

### Display
- Headline: `"Team A  5 — 4  Team B"`
- Table: Team A avg | Category | Team B avg | Delta

---

## 5. ESPN API Integration

### Base URL
```
https://fantasy.espn.com/apis/v3/games/fba/seasons/2025/segments/0/leagues/{leagueId}
```

### ESPN Stat IDs
| ID | Stat |
|----|------|
| 0 | PTS |
| 1 | BLK |
| 2 | STL |
| 3 | AST |
| 6 | REB |
| 11 | TO |
| 13 | FGA |
| 14 | FGM |
| 15 | FTA |
| 16 | FTM |
| 17 | 3PA |
| 18 | 3PM |
| 40 | GP |

### Auth
- espn_s2 + SWID cookies from browser ESPN sessions
- Passed server-side via Next.js API proxy routes

### Caching
- localStorage TTL cache, 15-minute expiry
- Key: `espn_cache_{endpoint}_{leagueId}_{params}`

---

# PRD: Yahoo Fantasy Sports Integration (v8-yahoo)

## Overview

Add Yahoo Fantasy Sports as a second provider alongside ESPN. The app gains a provider toggle (ESPN / Yahoo). Yahoo launches with NBA only; all other Yahoo sports show "Coming Soon." Trade, Compare, Power, and Rankings all switch context when the provider changes. Ship as one complete feature on the `yahoo-integration` branch (off `multi-sport`), merge when Yahoo NBA works end-to-end, tag `v8-yahoo`.

## Key Decisions Log

| Topic | Decision |
|---|---|
| Auth approach | Cookie bookmarklet first (B + T cookies from Yahoo); fall back to OAuth immediately if cookies don't authenticate |
| Yahoo npm package | Raw fetch only (`?format=json`); no yahoo-fantasy npm package |
| Provider scope | Global (one provider at a time across all sports) |
| Tab switcher location | Inside the Manual Setup card only |
| Multi-league | Same as ESPN (dropdown, rename, remove) |
| Separate hooks | `useYahooLeague` + `useYahooPlayers` (ESPN hooks untouched) |
| Settings event | Rename `espn-settings-changed` → `fantasy-settings-changed` (done in this PR) |
| Cache keys | Add `espn_` / `yahoo_` provider prefix to all cache keys |
| Stat windows (Yahoo) | Season · Last 30 Days · Last 14 Days · Last 7 Days · Proj (if supported) |
| Navbar badge | `[ ESPN ▾ ]` / `[ Yahoo ▾ ]` top-right; clicking opens in-place dropdown |
| Provider switch UX | Fires `fantasy-settings-changed` → pages reload data immediately |
| Non-NBA sports on Yahoo | Blocked with "Coming Soon" badge |
| QR phone transfer | Includes Yahoo credentials (both providers in one QR) |
| Port (local dev) | **3001** (`http://localhost:3001`) |
| Version tag | `v8-yahoo` |

## ESPN vs Yahoo: Key Differences

| | ESPN | Yahoo |
|---|---|---|
| Auth | SWID + espn_s2 cookies | B + T session cookies (bookmarklet) |
| API base | `lm-api-reads.fantasy.espn.com/apis/v3` | `fantasysports.yahooapis.com/fantasy/v2` |
| League key | Numeric ID (`12345678`) | `{game_key}.l.{league_id}` (`428.l.19877`) |
| Stat windows | season / 30 / 15 / 7 / proj | season / lastmonth / last14days / lastweek / proj |
| Response format | JSON | XML by default → use `?format=json` |

## localStorage Keys

### New keys (Yahoo)
```
fantasy_provider              — "espn" (default) | "yahoo"
yahoo_sport                   — "nba" (only enabled option)
yahoo_b                       — B cookie (session token)
yahoo_t                       — T cookie (login token)
yahoo_league_key_{sport}      — active league key ("428.l.19877")
yahoo_leagues_{sport}         — JSON array of { key, label?, teamName? }
```

## Git + Versioning
- Branch: `yahoo-integration` (off `multi-sport`)
- Merge path: `yahoo-integration` → `multi-sport` → `main`
- Tag on completion: `v8-yahoo`
