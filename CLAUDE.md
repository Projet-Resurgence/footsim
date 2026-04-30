# CLAUDE.md — FootSim

## Project

FootSim — static SPA simulating football matches between countries from "Projet Résurgence". Single-admin (Discord ID `772821169664426025`). Hosted on GitHub Pages (`BJBellum/footsim`). Persistence in `BJBellum/footsim-data` via GitHub Contents API.

## Stack

- Vite 5 + React 18 + TypeScript
- React Router v6 (BrowserRouter, basename `/footsim`)
- Zustand (stores: `session`, `credentials`, `teams`, `match`)
- Tailwind CSS (class-based dark mode) + Framer Motion + shadcn-style primitives
- Vitest + Testing Library
- Web Workers: player generator + match engine

## Auth

Discord OAuth implicit flow, scope `identify`. Token in `localStorage.footsim.session`. Admin gate via Discord ID matched to `VITE_ADMIN_DISCORD_ID`.

GitHub PAT stored in `localStorage.footsim.github_pat`. Required scope: `repo`. Set in `/dashboard/settings`. Validated via `GET /user`.

## Layout

```
src/
├── lib/
│   ├── env.ts              # typed import.meta.env access (literal — Vite static replace)
│   ├── theme.ts            # day/night cycle (6h-19h day)
│   ├── slug.ts, rng.ts, cn.ts, types.ts
│   ├── auth/discord.ts     # implicit-flow URL + parser + admin check
│   ├── github/
│   │   ├── api.ts          # readJson/writeJson/listDir/deleteFile (UTF-8 base64)
│   │   ├── store.ts        # team CRUD on top of api
│   │   └── matches.ts      # save match + append recentMatches
│   ├── gen/
│   │   ├── names.ts        # import.meta.glob over data/names/*.json
│   │   ├── positions.ts, overall.ts, players.ts
│   │   └── worker.ts       # chunked generation worker
│   └── sim/
│       ├── types.ts, lineup.ts, precompute.ts
│       ├── engine.ts       # tick(state, ctx) — pure-ish
│       ├── events.ts       # text templates + zone coords
│       └── worker.ts       # speed-driven loop
├── data/names/{culture}.json     # 21 cultures bundled
├── stores/                # Zustand slices
├── components/
│   ├── ui/                # Button, Input, Spinner, Toast
│   ├── layout/            # DashboardLayout, Sidebar
│   ├── auth/RequireAdmin
│   ├── team/              # FlagUpload, TeamCard, RosterTable, PlayerEdit
│   └── match/             # Pitch, Scoreboard, EventFeed, StatsPanel, SpeedControls, HalftimeOverlay
└── pages/
    ├── Home, NoAccess, auth/Callback
    ├── dashboard/        # Dashboard, Teams, TeamNew, TeamDetail, Settings
    └── matches/          # MatchSetup, MatchLive
```

## Data model

`data/teams/{slug}/team.json` — Team metadata + `recentMatches` (max 20).
`data/teams/{slug}/players.json` — `Player[]`.
`data/matches/{id}.json` — full match record (lineups, events, side stats).

Team: id, slug, name, flag (data URL PNG 150×150), culture, globalStrength, formation, playerCount, createdAt/By, optional `archived`.

Player stats: technical (9), mental (7), physical (7), goalkeeping (6, only for GK). All ints 1–20. `overall` (1–100) is computed from position-weighted average.

Cultures: 21 bundled — francais, anglais, allemand, italien, espagnol, portugais, grec, hongrois, tcheque, polonais, russe, ukrainien, suedois, neerlandais, roumain, serbe, croate, turc, arabe, japonais, coreen.

## Commands

```bash
npm install        # node 20+
npm run dev        # http://localhost:5173/footsim/
npm run build      # tsc -b && vite build && cp dist/index.html dist/404.html
npm run preview    # serve dist/
npm test           # vitest run
```

## Build / deploy

- Vite `base: '/footsim/'`. Production build copies `dist/index.html` → `dist/404.html` for SPA fallback on Pages.
- GitHub Actions workflow in `.github/workflows/pages.yml` writes `.env.production` from inline values + secret-backed Discord client ID, builds, deploys to Pages.

## Env vars (production written in CI)

- `VITE_DISCORD_CLIENT_ID` — Discord application client ID (public).
- `VITE_DISCORD_REDIRECT_URI` — must match Discord Developer Portal redirect.
- `VITE_DATA_REPO` — `BJBellum/footsim-data`.
- `VITE_DATA_BRANCH` — `main`.
- `VITE_ADMIN_DISCORD_ID` — `772821169664426025`.

Access **always** via literal `import.meta.env.VITE_FOO`. Dynamic indexing breaks Vite's static replacement → undefined at runtime → `Missing env var` throw at module load → blank screen.

## Match engine

### Pre-computation (`sim/precompute.ts`)

Called once per side before kick-off. Takes `players[]`, `formation`, optional `customLineup` (11 IDs), optional `tacticStyle`.

- **Lineup**: uses `customLineup` if provided and valid (11 resolvable players), else `pickXI` auto-selects best 11 by position fit.
- **Bench**: top 12 remaining players by `overall` desc. Engine draws from these for auto-subs.
- **Ratings computed from lineup**:
  - `attack` = `0.7 × avg(top3 attackers overall) + 0.3 × avg(AM overall)` × `tacticMods.attackMult`
  - `midfield` = `avg(all mid overall)` × `tacticMods.midfieldMult`
  - `defense` = `0.8 × avg(defenders overall) + 0.2 × GK overall`
  - `gk` = GK `overall`

### Tactic styles (`TacticMods`)

| Style | shotFreqMult | midfieldMult | attackMult | foulRateMult |
|---|---|---|---|---|
| possession | 0.88 | 1.12 | 1.00 | 1.00 |
| contre-attaque | 1.08 | 0.92 | 1.10 | 1.00 |
| direct | 1.18 | 1.00 | 1.00 | 1.00 |
| pressing | 1.00 | 1.15 | 1.00 | 1.12 |

### Tick loop (`sim/engine.ts → tick()`)

1 tick = 1 simulated minute. Worker calls `tick()` repeatedly at interval set by speed.

**Status machine**:
```
pregame → firstHalf (1–45+HT) → halftime → secondHalf (46–90+AT)
  → [extraTimeFirst (91–105) → extraTimeHalfTime → extraTimeSecond (106–120+)]
  → [penalties] → fulltime
```
Both `halftime` and `extraTimeHalfTime` stall the loop until UI sends `resume`.

**Each tick**:
1. Advance `minute++`; check end-of-period thresholds (with added time).
2. **Possession roll**: `P(home) = homeMid / (homeMid + awayMid)` where each side's mid is multiplied by `0.93^(reds)`.
3. **Event roll** — weighted draw over:

| Event | Base weight |
|---|---|
| shot | `0.08 × (0.6 + pAttack) × shotFreqMult` |
| foul | `0.08 × opp.foulRateMult` |
| corner | 0.04 |
| offside | 0.03 (0 if `noOffside` rule) |
| keyPass | 0.10 |
| freeKick | 0.03 |
| dribble | `0.04 × pAttack` |
| clearance | `0.03 × (1 − pAttack)` |
| (nothing) | remainder |

where `pAttack = myAttack / (myAttack + oppDefense)`, both multiplied by `0.93^reds`.

### Shot resolution

`resolveShot()` returns `bool` (goal scored):
- `pGoal = sigmoid((finishing + composure − 0.5 × gkOverall) / 8) × mult` clamped `[0.04, 0.75]`
- 55% chance on-target; if on-target: roll `pGoal` → goal, else 10% crossbar, else save.
- After any goal in ET: `tryShot()` calls `checkGoldenGoal()` → fulltime if golden goal rule active.

Special shot chains:
- **Foul** (15% chance) → penalty → shot with `mult=1.4`
- **Corner** (45% chance) → header → shot with `mult=0.85`
- **FreeKick** (30% chance) → shot with `mult=0.75`
- **Dribble** (40% chance) → shot with `mult=1.05`

### Cards

`yellow` roll: `0.005 + 0.005 × (aggression/20)` for immediate red; `0.13 + 0.06 × (aggression/20)` for yellow. Second yellow on same player → red. Red → player removed from `homeOnPitch`/`awayOnPitch`.

### Auto-substitutions

Triggered at halftime transition (`status: halftime → secondHalf`). Per side: `min(2, maxSubs − subsUsed)` subs. Swaps lowest-overall non-GK starters for best bench player of same position family (CB/LB/RB, DM/CM/AM/LM/RM, LW/RW/ST). Falls back to best available if no family match.

### Penalty shootout (`simulatePenalties()`)

5 kicks each then sudden death (max 20 rounds). `pGoal = sigmoid((finishing + composure − 0.5 × gkOverall) / 8) × 1.5` clamped `[0.50, 0.86]`. Result stored in `state.penaltyScore`.

### Match rules (`MatchRules`)

| Field | Default | Effect |
|---|---|---|
| `noOffside` | false | sets `wOffside = 0` |
| `maxSubs` | 5 | caps auto-subs + manual subs |
| `extraTime` | false | adds 2×15 min if tied at 90' |
| `goldenGoal` | false | first ET goal ends match |
| `penalties` | false | TAB after ET (or after 90' if no ET) |

### Speeds

`0.5` (2000 ms/tick), `1` (1000 ms), `2` (500 ms), `5` (200 ms), `instant` (sync loop, auto-resumes both halftimes).

## Encoding gotcha

`btoa` is Latin-1 only. Names with accents and event emojis (⚽🟨🟥🧤) blow up. `lib/github/api.ts` exposes `utf8ToBase64` / `base64ToUtf8` using `TextEncoder`/`TextDecoder`. **Use only those for content payloads** — never raw `btoa`/`atob` for user data.

## Theme

`html.dark` toggled by `lib/theme.ts` based on user local hour (`6h-19h` day, else night). CSS vars defined in `src/styles/globals.css` for `bg, surface, text, muted, border, accent, danger, warning, pitch, pitch-line`. Pitch SVG uses `var(--pitch)`/`var(--pitch-line)`.

## Routing

```
/                              public home
/auth/callback                 Discord redirect target
/no-access                     non-admin
/dashboard                     RequireAdmin
  /                            overview cards
  /teams, /teams/new, /teams/:slug
  /settings
/match                         RequireAdmin (setup)
/match/:id                     RequireAdmin (live)
```

## Testing

Vitest, jsdom env, setup at `tests/setup.ts`. Pure-logic units only (gen, github api, store, auth helpers). No E2E.

## Conventions

- French UI strings (admin language).
- Commit prefixes: `feat`, `fix`, `chore`, `docs`, `ci`, `feat(scope)`.
- All commits Co-Authored-By Claude.
- File paths absolute when calling tools.
- Add tests when touching `lib/gen` or `lib/sim` or `lib/github`.

## Known scope gaps

- 12 cultures from spec deferred (chinois, vietnamien, thai, indonesien, persan, indien, israelien, bresilien, argentin, mexicain, anglo-americain, quebecois). Add JSON in `src/data/names/` and re-add to `Culture` union + `CULTURES` + `CULTURE_LABEL` in `lib/types.ts`.
- No E2E tests.
- No mobile-specific layouts (desktop-first).
- No transfers / contracts / leagues.
