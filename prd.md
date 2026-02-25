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
