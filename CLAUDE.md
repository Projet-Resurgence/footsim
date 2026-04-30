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

Pre-compute → ratings (attack, midfield, defense, gk) per side. Live tick = 1 simulated minute. Possession side rolled by midfield ratio (with `0.93^reds` multiplier). Event roll: shot, foul, corner, offside, save, keyPass, none. Goal probability = `sigmoid((finishing + composure − 0.5*gk) / 8)` clamped [0.04, 0.55]. Yellow rolls boosted by aggression. Second yellow → red, removes from `homeOnPitch`/`awayOnPitch`.

Speeds: 0.5 / 1 / 2 / 5 (ms-driven `setInterval`) or instant (sync loop). Halftime stalls until UI sends `resume`.

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
